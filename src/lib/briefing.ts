import { db } from "./db";
import { aiKind } from "./wizard-branch";
import { getAnalyticsOverview, type AnalyticsOverview } from "./analytics-data";
import { getJourney, type Journey } from "./journey";
import { getWeeklyProgress, type WeeklyProgress } from "./progress";
import { getCronHealth, criticalCronIssues } from "./cron-alerts";
import { isCloudMode } from "./cloud";
import { hasDataforseo } from "./pipeline-pack";
import { effectiveAutomations, type Project } from "./projects";
import type { GscFullRow, GscQueryStat, Suggestion } from "./metrics";
import { getAuthority, needsLinkMove, HEALTHY_REF_DOMAINS, type Authority } from "./authority";

// The dispatcher's briefing - Home's top surface, where the agent reports to
// the owner in the first person instead of the page narrating about it.
//
// Why this exists: SEO pays out on a delay measured in months. A young site's
// honest dashboard is a flat line, and a flat line reads as "this thing isn't
// working" long before it reads as "it's month two". Every serious tool solves
// that the same way - Search Console Insights leads with trending-up queries,
// Ahrefs and Semrush both point people at page-two rankings first - because
// direction and near-misses are legible when absolute numbers are not. This
// module derives those same signals from data the page already loaded, and
// words them as the agent's own report.
//
// Two rules carried over from journey.ts and progress.ts, and they are the
// whole point:
//
//   1. Never manufacture a win. Every line below is a real row from GSC, the
//      rank checks, or the pages table. An empty `wins` array is a normal
//      output, and `patience` says what's actually happening instead of
//      padding the list with something that didn't happen.
//   2. The agent never claims to have done what it did not do. `doing` lists
//      only work the state proves is under way.
//
// Everything is pure derivation from inputs the caller already has, so the
// briefing costs no extra query on Home and the MCP tool (get_briefing) can
// build the identical object from the same three sources.

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

// What the dispatcher is in the middle of. Drives the whole card's colour and
// the character's pose, so the states are mutually exclusive and ordered by
// which one the owner most needs to see (see pickTone).
export type BriefingTone =
  | "alert" // something is broken and the owner has to act
  | "setup" // first-run work is still landing; nothing needed from anyone
  | "active"; // the normal shift - reporting numbers and wins

export type QuickWinKind =
  | "milestone" // a first-ever moment (first click, first top-10)
  | "striking" // position 8-20: one push from page one
  | "climber" // a tracked keyword that moved up
  | "trending" // a query whose impressions are climbing
  | "new_query" // a search Google started showing the site for
  | "ctr_gap" // ranks on page one, under-clicked for that position
  | "zero_click" // seen a lot, clicked never
  | "indexed" // pages Google added to its index
  | "shipped"; // pages that went live

export type QuickWin = {
  key: string;
  kind: QuickWinKind;
  // The win itself, in the dispatcher's voice. Short enough to scan.
  headline: string;
  // The number behind it, or the lever it hands the owner. Null when the
  // headline already carries everything true about it.
  detail: string | null;
  // Where to go look. Every win is falsifiable - the owner can open the screen
  // it came from and see the same row.
  href: string | null;
};

// The one thing worth the owner's hands today, when there is one. Today this
// is always the authority nudge - links are the half of SEO the pipeline
// can't do alone (see authority.ts) - but the shape is deliberately generic.
// Null most days: a healthy profile produces no nudge, and inventing a chore
// to fill the slot would break the same honesty rule as padding `wins`.
export type BriefingAction = {
  headline: string;
  detail: string;
  href: string;
};

export type BriefingNumbers = {
  clicks: number;
  impressions: number;
  // Change vs the previous window of the same length; null when there is no
  // previous window to compare against yet.
  clicksDelta: number | null;
  impressionsDelta: number | null;
  // Which window these numbers cover, because the two are not interchangeable
  // and the UI has to name the one it got:
  //   live24h - GSC's live hourly feed, the real "today" number.
  //   week    - the last 7 stored days, summed.
  // There is deliberately NO single-stored-day option. The hourly cron writes
  // the last 3 days with dataState ALL, so the newest stored row is TODAY,
  // provisional and a few hours old - reporting it as a day's traffic showed
  // "2 impressions" on a site that had done 90 in the previous 24 hours
  // (2026-08-02). A number that collapses by 40x depending on whether one API
  // call answered is worse than no number.
  window: "live24h" | "week";
};

export type Briefing = {
  tone: BriefingTone;
  // What the agent says before it says anything else. Two fields because they
  // do different jobs: the greeting is the same every day on purpose (a
  // colleague who reinvents their hello is unsettling), and the recap is the
  // whole report compressed into one sentence, so the card can stay shut and
  // still have said something true.
  greeting: string;
  recap: string;
  // The dispatcher's opening line inside the report - one sentence, first
  // person, carrying the numbers.
  lead: string;
  // The numbers behind the lead. Null before any search data exists at all.
  numbers: BriefingNumbers | null;
  // What it is working on right now. Only ever things the state proves.
  doing: string[];
  // Is the automation loop actually live - pipeline wired into the repo AND at
  // least one builder automation on? Kept separate from `tone` because it is a
  // different question: a project with auto-build switched off is not broken
  // and not mid-setup, it is deliberately hand-driven, and the status chip must
  // say "standing by" rather than "on the desk". Claiming a shift nobody is
  // working is the exact silent-failure this product refuses to ship.
  onDuty: boolean;
  wins: QuickWin[];
  // Today's one hands-on move, or null. See BriefingAction.
  action: BriefingAction | null;
  // Why the wins list is thin, in the agent's voice. Set only when there is
  // something honest to say about the wait - never used to pad `wins`.
  patience: string | null;
  // "I got an upgrade" - a DispatchSEO release this browser hasn't seen yet,
  // reworded so product news arrives in the same voice as everything else on
  // this card instead of as a separate bar from the building management. Null
  // whenever there's nothing new, which is most days.
  release: { version: string; summary: string; line: string } | null;
};

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

// Position 8-20 is the "striking distance" band every major tool points at
// first: close enough that one better page or a few links moves it onto page
// one, far enough that it isn't already there.
const STRIKING_MIN = 8;
const STRIKING_MAX = 20;

// Roughly what a result at each position earns in clicks, used only to spot
// page-one queries that are clearly under-clicked FOR THEIR POSITION. Kept
// deliberately conservative - the point is to catch an obviously weak title,
// not to grade every query against a benchmark.
const EXPECTED_CTR: Record<number, number> = {
  1: 0.27,
  2: 0.15,
  3: 0.11,
  4: 0.08,
  5: 0.07,
  6: 0.05,
  7: 0.04,
  8: 0.03,
  9: 0.03,
  10: 0.025,
};

// Below these, a "win" is one person's stray search, not a signal. The whole
// module's credibility rests on never calling noise a result.
const MIN_IMPRESSIONS_STRIKING = 5;
const MIN_IMPRESSIONS_TRENDING = 10;
// How much the PRIOR window must have done before "up N%" is a real claim
// rather than division by nearly nothing. See the filter in findWins.
const MIN_TRENDING_BASE = 5;
const MIN_IMPRESSIONS_CTR_GAP = 30;
const MIN_IMPRESSIONS_ZERO_CLICK = 25;

// How many wins the card shows. More than this and it stops being a briefing.
const MAX_WINS = 4;

// ---------------------------------------------------------------------------
// Query-window helpers
// ---------------------------------------------------------------------------

type QueryAgg = { query: string; clicks: number; impressions: number; position: number | null };

// Fold a set of daily snapshots into one row per query. Position is weighted
// by impressions, the same way analytics-data.ts weights it, so a query that
// ranked #4 on a 200-impression day and #40 on a 2-impression day reports
// near #4 rather than the midpoint of two unequal days.
function foldQueries(rows: GscFullRow[]): Map<string, QueryAgg> {
  const acc = new Map<string, { clicks: number; impressions: number; posWeight: number }>();
  for (const row of rows) {
    for (const q of (row.top_queries ?? []) as GscQueryStat[]) {
      const a = acc.get(q.query) ?? { clicks: 0, impressions: 0, posWeight: 0 };
      const impr = q.impressions ?? 0;
      a.clicks += q.clicks ?? 0;
      a.impressions += impr;
      a.posWeight += (q.position ?? 0) * impr;
      acc.set(q.query, a);
    }
  }
  const out = new Map<string, QueryAgg>();
  for (const [query, a] of acc) {
    out.set(query, {
      query,
      clicks: a.clicks,
      impressions: a.impressions,
      position: a.impressions > 0 ? a.posWeight / a.impressions : null,
    });
  }
  return out;
}

const nf = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) => `${nf(n)} ${word}${n === 1 ? "" : "s"}`;
// Search terms are the owner's own words coming back at them - quote them so a
// two-word query never reads as part of the sentence around it.
const quoted = (s: string) => `"${s}"`;

// ---------------------------------------------------------------------------
// Wins
// ---------------------------------------------------------------------------

// Each finder returns at most one win, and the order they run in IS the
// priority order: firsts beat near-misses, near-misses beat housekeeping. Every
// one of them can return null, which is the honest answer most days on a young
// site.
function findWins(
  overview: AnalyticsOverview,
  journey: Journey,
  weekly: WeeklyProgress,
): QuickWin[] {
  const wins: QuickWin[] = [];
  const gsc = overview.gsc; // up to 28 daily rows, ascending
  const recent = gsc.slice(-7);
  const prior = gsc.slice(0, -7);
  const recentQ = foldQueries(recent);
  const priorQ = foldQueries(prior);
  // A query is only "new" against a window long enough to mean it. With less
  // than a week of prior data, everything looks new and the claim is worthless.
  const priorIsMeaningful = prior.length >= 7;

  // --- firsts: the moments worth remembering while the graph is still flat ---
  for (const m of journey.fresh_milestones) {
    wins.push({
      key: `milestone:${m.key}`,
      kind: "milestone",
      headline: `${m.label}. That one only happens once.`,
      // The base rate behind the first, where one exists (journey.ts
      // BENCHMARKS) - "fewer than 2 in 100 pages get there in a year" is what
      // turns the checkbox into a win the owner can size.
      detail: m.benchmark,
      href: "/analytics",
    });
  }

  // --- striking distance: the closest thing to a free ranking on the board ---
  const striking = [...recentQ.values()]
    .filter(
      (q) =>
        q.position != null &&
        q.position >= STRIKING_MIN &&
        q.position <= STRIKING_MAX &&
        q.impressions >= MIN_IMPRESSIONS_STRIKING,
    )
    .sort((a, b) => b.impressions - a.impressions)[0];
  if (striking) {
    const pos = Math.round(striking.position!);
    wins.push({
      key: `striking:${striking.query}`,
      kind: "striking",
      headline: `We're sitting at #${pos} for ${quoted(striking.query)}.`,
      detail: `${plural(striking.impressions, "impression")} in the last week, and page one starts at #10. This is the cheapest ranking on the board to go take.`,
      href: "/analytics",
    });
  }

  // --- a tracked keyword that actually moved up ---
  const climber = overview.rankings
    .filter((r) => r.current != null && r.change != null && r.change > 0)
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0];
  if (climber && climber.change != null) {
    wins.push({
      key: `climber:${climber.keyword.id}`,
      kind: "climber",
      headline: `${quoted(climber.keyword.keyword)} climbed ${climber.change} spot${climber.change === 1 ? "" : "s"} to #${climber.current}.`,
      detail:
        climber.volume != null
          ? `About ${nf(climber.volume)} searches a month sit behind that keyword.`
          : null,
      href: "/keywords",
    });
  }

  // --- a query on the way up: direction, when the absolute number is small ---
  const trending = [...recentQ.values()]
    .filter((q) => q.impressions >= MIN_IMPRESSIONS_TRENDING)
    .map((q) => {
      const before = priorQ.get(q.query);
      // Prior is up to 21 days; normalise it to a 7-day rate so the comparison
      // is like for like instead of flattering the older, longer window.
      const priorRate =
        before && prior.length > 0 ? (before.impressions / prior.length) * recent.length : 0;
      return { q, priorRate, gain: priorRate > 0 ? (q.impressions - priorRate) / priorRate : null };
    })
    // The prior window needs a real base before a percentage means anything.
    // Without this floor, a query that did a third of an impression a week ago
    // and 16 this week reports "4700% above the week before" - arithmetically
    // true, and exactly the kind of number that teaches an owner to stop
    // believing this card. Genuinely-new queries are already covered by the
    // new_query win, which says so in words instead of a ratio.
    .filter((r) => r.gain != null && r.gain >= 0.25 && r.priorRate >= MIN_TRENDING_BASE)
    .sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0))[0];
  if (trending && trending.gain != null) {
    wins.push({
      key: `trending:${trending.q.query}`,
      kind: "trending",
      headline: `${quoted(trending.q.query)} is picking up. Impressions are ${Math.round(trending.gain * 100)}% above the week before.`,
      detail: `${plural(trending.q.impressions, "impression")} in the last seven days.`,
      href: "/analytics",
    });
  }

  // --- searches Google started showing the site for at all ---
  if (priorIsMeaningful) {
    const fresh = [...recentQ.values()].filter(
      (q) => !priorQ.has(q.query) && q.impressions >= MIN_IMPRESSIONS_STRIKING,
    );
    if (fresh.length > 0) {
      const best = [...fresh].sort((a, b) => b.impressions - a.impressions)[0];
      wins.push({
        key: "new_query",
        kind: "new_query",
        headline:
          fresh.length === 1
            ? `Google started showing us for a search we'd never appeared in: ${quoted(best.query)}.`
            : `Google started showing us for ${plural(fresh.length, "new search")} this week.`,
        detail:
          fresh.length === 1
            ? `${plural(best.impressions, "impression")} already.`
            : `Biggest of them: ${quoted(best.query)}, ${plural(best.impressions, "impression")}.`,
        href: "/analytics",
      });
    }
  }

  // --- ranks well, gets ignored: the one fix that pays out same-week ---
  const ctrGap = [...recentQ.values()]
    .filter((q) => {
      if (q.position == null || q.impressions < MIN_IMPRESSIONS_CTR_GAP) return false;
      const pos = Math.round(q.position);
      const expected = EXPECTED_CTR[pos];
      if (expected == null) return false;
      return q.clicks / q.impressions < expected / 2;
    })
    .sort((a, b) => b.impressions - a.impressions)[0];
  if (ctrGap) {
    const pos = Math.round(ctrGap.position!);
    // Framed as the win it is. Being on page one is the hard part and we have
    // already done it; the weak click-through is the upside still sitting
    // there, not a failure to open with.
    wins.push({
      key: `ctr:${ctrGap.query}`,
      kind: "ctr_gap",
      headline: `We're on page one for ${quoted(ctrGap.query)}, sitting at #${pos}.`,
      detail: `${plural(ctrGap.impressions, "impression")} and ${plural(ctrGap.clicks, "click")} so far. The ranking is the hard part and it's done - a sharper title on that page is the cheapest traffic available to us.`,
      href: "/analytics",
    });
  }

  // --- seen a lot, clicked never ---
  const zeroClick = [...recentQ.values()]
    .filter((q) => q.clicks === 0 && q.impressions >= MIN_IMPRESSIONS_ZERO_CLICK)
    .sort((a, b) => b.impressions - a.impressions)[0];
  if (zeroClick) {
    // Same reframe as ctr_gap: Google putting us in front of people this often
    // IS the result at this stage. The missing click is the next milestone,
    // not a scolding.
    wins.push({
      key: `zero:${zeroClick.query}`,
      kind: "zero_click",
      headline: `Google put us in front of ${plural(zeroClick.impressions, "search")} for ${quoted(zeroClick.query)}.`,
      detail:
        zeroClick.position != null && zeroClick.position > 10
          ? `No clicks off it yet - we're at #${Math.round(zeroClick.position)}, so this is visibility banking up. Climbing it is what turns it into traffic.`
          : "No clicks off it yet, which usually means the snippet undersells the page rather than anything being wrong.",
      href: "/analytics",
    });
  }

  // --- housekeeping: real, but only interesting when nothing above fired ---
  if (weekly.newly_indexed > 0) {
    wins.push({
      key: "indexed",
      kind: "indexed",
      // NOT plural() here - it appends its own "s", which turned this into
      // "8 of our pagess". "pages" is already plural; only the count varies.
      headline: `Google indexed ${nf(weekly.newly_indexed)} of our pages this week.`,
      detail: "Nothing can rank until Google has it indexed, so this is the step before results.",
      href: "/pages",
    });
  }
  const shipped = weekly.guides_shipped + weekly.tools_shipped;
  if (shipped > 0) {
    wins.push({
      key: "shipped",
      kind: "shipped",
      headline: `I shipped ${plural(shipped, "page")} this week.`,
      detail: "Each one is another page that can start picking up searches.",
      href: "/pages",
    });
  }

  return wins.slice(0, MAX_WINS);
}

// ---------------------------------------------------------------------------
// Today's action
// ---------------------------------------------------------------------------

// Links are the one input the dispatcher cannot produce - it can only keep
// the ask specific. Two honest triggers, in priority order:
//   1. Thin profile (< HEALTHY_REF_DOMAINS referring domains) with a free
//      playbook listing still open.
//   2. Healthy but stalled: a measured month with zero new referring domains,
//      free listings still open.
// Everything else - unmeasured (no DataForSEO), exhausted playbook, healthy
// and growing - is silence. During an alert or setup the action stays null
// too: the card must not stack a chore on top of a fire.
function pickAction(authority: Authority | null, muted: boolean): BriefingAction | null {
  if (!authority || muted || !needsLinkMove(authority)) return null;
  // needsLinkMove guarantees both of these.
  const rd = authority.referring_domains as number;
  const move = authority.next_move as NonNullable<Authority["next_move"]>;

  const moveLine = (lead: string) =>
    `${lead} Today's ${move.effortMins}-minute move: get us listed on ${move.name} - the copy is prefilled on the Playbook page.`;

  if (rd < HEALTHY_REF_DOMAINS) {
    return {
      headline:
        rd === 0
          ? "The thin part of our game is links: no sites link to us yet."
          : `The thin part of our game is links: ${plural(rd, "site")} link${rd === 1 ? "s" : ""} to us so far.`,
      detail: moveLine(
        `I write the pages; the links have to come from you. Google starts trusting a young domain around ${HEALTHY_REF_DOMAINS} referring domains, and until then even good pages sit deep in the results.`,
      ),
      href: "/playbook",
    };
  }
  return {
    headline: "No new sites linked to us in the last month.",
    detail: moveLine(
      "The profile is healthy, but rankings compound off links and the graph went flat.",
    ),
    href: "/playbook",
  };
}

// ---------------------------------------------------------------------------
// The briefing
// ---------------------------------------------------------------------------

function pickNumbers(overview: AnalyticsOverview): BriefingNumbers | null {
  // GSC's live feed is the only thing here that can honestly be called
  // "today", so it wins whenever it answered and has anything in it.
  const f = overview.fresh24;
  if (f && (f.clicks > 0 || f.impressions > 0)) {
    return {
      clicks: f.clicks,
      impressions: f.impressions,
      clicksDelta: f.prevClicks > 0 || f.clicks > 0 ? f.clicks - f.prevClicks : null,
      impressionsDelta:
        f.prevImpressions > 0 || f.impressions > 0 ? f.impressions - f.prevImpressions : null,
      window: "live24h",
    };
  }
  // That call is a live request to Google wrapped in a catch, cached five
  // minutes - so it CAN just not be there, and the fallback has to be
  // something that doesn't lurch. A week's total is the smallest window that
  // stays steady: it moves by a day at a time instead of by whether one API
  // call answered, and it can never be smaller than the day inside it.
  const daily = overview.gscDaily;
  if (daily.length === 0) return null;
  const sum = (rows: typeof daily, k: "clicks" | "impressions") =>
    rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const last7 = daily.slice(-7);
  const prior7 = daily.length >= 14 ? daily.slice(-14, -7) : null;
  const clicks = sum(last7, "clicks");
  const impressions = sum(last7, "impressions");
  return {
    clicks,
    impressions,
    clicksDelta: prior7 ? clicks - sum(prior7, "clicks") : null,
    impressionsDelta: prior7 ? impressions - sum(prior7, "impressions") : null,
    window: "week",
  };
}

export type BriefingInput = {
  overview: AnalyticsOverview;
  journey: Journey;
  weekly: WeeklyProgress;
  // Background jobs that are failing or overdue - the owner has to act.
  failingJobs: number;
  // First-run research/rank work still landing. Not a problem; not silence
  // either, and the difference is the whole reason this state exists.
  settingUp: boolean;
  // Live pipeline state, used for `doing` - only ever things that are true.
  building: string | null; // title of the page being built right now
  queued: number; // approved ideas waiting on the builder
  pendingDecisions: number; // ideas waiting on the owner
  // Pipeline wired into the repo AND a builder automation switched on. See
  // Briefing.onDuty for why this is not folded into `tone`.
  onDuty: boolean;
  // The owner's AI is the ordinary Claude/ChatGPT app: nothing runs unless
  // they paste a sentence, so an empty queue is a prompt for them, not a
  // background job still landing.
  chatClient?: boolean;
  // The authority read (authority.ts) behind today's action. Null/omitted
  // degrades to no action - a caller without the data never invents a nudge.
  authority?: Authority | null;
  // The newest release this browser hasn't acknowledged, if any. Home reads it
  // from the same cookie the layout banner used to; get_briefing leaves it
  // null, because "unseen" is a property of a browser and an agent doesn't
  // have one.
  release?: { version: string; summary: string } | null;
};

export function computeBriefing(input: BriefingInput): Briefing {
  const { overview, journey, weekly, failingJobs, settingUp, building, queued, pendingDecisions } =
    input;

  const numbers = pickNumbers(overview);
  const wins = findWins(overview, journey, weekly);
  const action = pickAction(input.authority ?? null, failingJobs > 0 || settingUp);

  // What it is actually doing. Order is "closest to shipping" first.
  const doing: string[] = [];
  if (building) doing.push(`Building ${quoted(building)} right now.`);
  if (queued > 0) {
    doing.push(
      `${plural(queued, "approved idea")} queued. I ship the top one each morning.`,
    );
  }
  if (pendingDecisions > 0) {
    doing.push(
      `${plural(pendingDecisions, "idea")} waiting on your call down in Next actions.`,
    );
  }

  // Tone, in the order the owner needs it. A broken job outranks everything:
  // a briefing that opens with a nice number while the collector is down is
  // the exact failure this product cannot afford.
  const tone: BriefingTone = failingJobs > 0 ? "alert" : settingUp ? "setup" : "active";

  let lead: string;
  if (tone === "alert") {
    lead =
      failingJobs === 1
        ? "One of my background jobs is failing and I can't fix it from here."
        : `${nf(failingJobs)} of my background jobs are failing and I can't fix them from here.`;
  } else if (tone === "setup") {
    lead = "I'm still setting up in the background. Nothing needed from you yet.";
  } else if (input.chatClient && !building && queued === 0 && pendingDecisions === 0 && !(numbers && numbers.impressions > 0)) {
    lead =
      "Nothing from your chat app yet. Ask it for a few article ideas, approve the ones you like on the Queue screen, and I take it from there.";
  } else if (numbers && numbers.impressions > 0) {
    const window = numbers.window === "live24h" ? "In the last 24 hours" : "Over the last week";
    lead =
      numbers.clicks > 0
        ? `${window} we picked up ${plural(numbers.clicks, "click")} off ${plural(numbers.impressions, "impression")}.`
        : `${window} we showed up ${plural(numbers.impressions, "time")} in Google. The clicks come after the rankings do.`;
  } else if (journey.gsc_connected) {
    lead = "Google hasn't shown us to anyone yet. That's normal this early; there just aren't enough pages out there for it to find.";
  } else {
    lead = "No search data is reaching me. Search Console isn't connected on your side yet.";
  }

  // Only ever set when there is nothing to celebrate, and only when there is
  // something honest to say about why. Silence is a fine answer otherwise.
  let patience: string | null = null;
  if (wins.length === 0 && tone === "active") {
    if (!journey.gsc_connected) {
      patience =
        "I can't spot wins without Search Console. Connect it and I'll start reading the numbers Google already has on you.";
    } else if (overview.gsc.length < 7) {
      patience = `Only ${plural(overview.gsc.length, "day")} of search data so far. Give me a week and there'll be something to point at.`;
    } else {
      patience = `${journey.expectation} Nothing moved far enough this week to be worth your time. I'll keep publishing.`;
    }
  }

  // The one sentence that has to carry the whole report when the card is shut,
  // which is how most people will see it most days. It answers two questions in
  // order: did anything need me, and did anything good happen. Trouble and
  // setup say only their own thing - a recap that appended "and 2 quick wins"
  // to a failing collector would be reading out the weather during a fire.
  let recap: string;
  if (tone === "alert") {
    recap =
      failingJobs === 1
        ? "One of my background jobs is stuck and I need a hand with it."
        : `${nf(failingJobs)} of my background jobs are stuck and I need a hand with them.`;
  } else if (tone === "setup") {
    recap = "Still getting set up back here. I'll have something to report shortly.";
  } else {
    // Name the window the numbers actually came from. These are not the same
    // measurement and swapping between them silently is how "90 impressions"
    // became "2 impressions" in the space of two minutes.
    const window = numbers?.window === "live24h" ? "in the last day" : "this week";
    const traffic =
      numbers && numbers.impressions > 0
        ? numbers.clicks > 0
          ? `${plural(numbers.clicks, "click")} and ${plural(numbers.impressions, "impression")} ${window}`
          : `${plural(numbers.impressions, "impression")} ${window}`
        : null;
    // Wins lead. This line is the one thing most owners read, and on a site
    // that is doing everything right it will still be reporting small numbers
    // for weeks - so it opens with what went well and lets the traffic follow,
    // rather than opening with a number that is honest and discouraging.
    const good = wins.length > 0 ? `${plural(wins.length, "thing")} went our way` : null;
    if (good && traffic) recap = `${good}, and we picked up ${traffic}.`;
    else if (good) recap = `${good}. Traffic hasn't caught up yet, but it follows this.`;
    else if (traffic) recap = `We picked up ${traffic}. Nothing else to flag.`;
    else recap = "Quiet one. Nothing broken, and I'm still publishing.";
    recap = recap.charAt(0).toUpperCase() + recap.slice(1);
  }

  const release = input.release
    ? {
        version: input.release.version,
        summary: input.release.summary,
        line: "I picked up an upgrade since you were last here.",
      }
    : null;

  return {
    tone,
    greeting: "Hey boss.",
    recap,
    lead,
    numbers,
    doing,
    wins,
    action,
    patience,
    release,
    onDuty: input.onDuty,
  };
}

// ---------------------------------------------------------------------------
// Server entry points
// ---------------------------------------------------------------------------

// The pipeline half of the input - queue state, failing jobs, and whether the
// first-run work is still landing. Split out from computeBriefing so Home can
// pass the overview/journey/weekly it has ALREADY fetched (the briefing must
// not double the cost of the page it sits on) while get_briefing over MCP
// fetches the lot.
export async function gatherPipelineState(
  project: Project,
  overview: AnalyticsOverview,
): Promise<
  Pick<
    BriefingInput,
    "failingJobs" | "settingUp" | "building" | "queued" | "pendingDecisions" | "onDuty" | "chatClient" | "authority"
  >
> {
  const client = db();
  const [sugRes, health, authority] = await Promise.all([
    client.from("suggestions").select("*").eq("project_id", project.id),
    // Same scoping as Home: a cloud tenant sees only its own project's jobs,
    // never the deployment-wide ones that belong to us as the operator.
    getCronHealth(isCloudMode() ? project.slug : undefined),
    // The authority read behind today's action - cache-row + history only,
    // never a paid call. Failure degrades to no nudge, same as every other
    // enhancement here.
    getAuthority(project).catch(() => null),
  ]);
  const suggestions = (sugRes.data ?? []) as Suggestion[];

  // The same bar as Home's red panel (criticalCronIssues): persistent,
  // missed-window, or urgent failures only. Update notices and one-off blips
  // must not flip the dispatcher into its alarm pose - crying wolf on the
  // normal weather of scheduled jobs is what trains owners to ignore the pose
  // that matters. Quota waits are excluded here too, matching Home, where
  // they get their own calmer amber surface.
  const failingJobs = criticalCronIssues(
    health.filter((h) => !isCloudMode() || h.job.includes(`--${project.slug}`)),
  ).length;

  // The pipeline is in, but the first research or the first rank check hasn't
  // landed yet - the honest "I'm still filling this in" window. Derived from
  // data the page already holds rather than the onboarding status endpoint,
  // which fires the first-run crons as a side effect and must not run on a
  // page render.
  //
  // Rank tracking is the PAID half, so a free/GSC-only project has no rank
  // check coming - ever. Waiting on one there would park the dispatcher in
  // "still setting up" permanently, describing work that isn't pending, it's
  // just not configured. Same trap the first-run strip fell into.
  const chatClient = project.ai_choice != null && aiKind(project.ai_choice) === "chat";
  const pipelineInstalled = !chatClient && project.pipeline_installed_at != null;
  const ranksPossible = hasDataforseo(project);
  const settingUp =
    pipelineInstalled &&
    (suggestions.length === 0 || (ranksPossible && !overview.rankings.some((r) => r.checked)));

  const automations = effectiveAutomations(project);

  return {
    failingJobs,
    settingUp,
    building: suggestions.find((s) => s.status === "in_progress")?.title ?? null,
    queued: suggestions.filter((s) => s.status === "approved").length,
    pendingDecisions: suggestions.filter((s) => s.status === "pending").length,
    onDuty:
      pipelineInstalled && (automations.auto_build_guides || automations.auto_build_tools),
    chatClient,
    authority,
  };
}

// Everything from scratch - the MCP door (get_briefing). Home does not use
// this: it builds the same object from data already in hand.
export async function getBriefing(project: Project): Promise<Briefing> {
  const overview = await getAnalyticsOverview(project);
  const [journey, weekly, pipeline] = await Promise.all([
    getJourney(project, overview),
    getWeeklyProgress(project, overview),
    gatherPipelineState(project, overview),
  ]);
  return computeBriefing({ overview, journey, weekly, ...pipeline });
}
