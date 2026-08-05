import { db } from "./db";
import { effectiveAutomations, type Project } from "./projects";
import type { GscQueryStat } from "./metrics";

// The refresh detector: finds published guides sitting just short of the
// money positions and queues a `type:"update"` suggestion for the daily
// builder. This is the cheapest real traffic move in SEO - a page at #12
// already carries Google's partial trust, and closing its gaps moves it to
// page one for a fraction of what a new page costs - and it was the one loop
// the product could see but not act on: weekly-opportunities (retired) used
// to write update suggestions nobody consumed, and build-guide only ever
// pulled type "guide". The consumption half lives in the build-guide
// instructions' UPDATE MODE; this module is the supply half, run nightly
// from daily-ranks.
//
// Honesty rules, same as every detector-shaped surface here:
// - Every candidate is a real measured row (GSC query positions over the
//   last 14 data days, or the nightly rank checks). No guesses.
// - Conservative by design: it queues at most enough to keep MAX_LIVE_UPDATES
//   in flight, never floods the owner's queue, and a page it flagged (or that
//   was refreshed) goes quiet for COOLDOWN_DAYS.
// - Failure/missing tables degrade to {skipped}, never a dead cron.

// Positions 1-4 are winning - leave them alone. Past ~20 the page has a
// targeting problem, not a polish problem, and a refresh rarely moves it.
const POS_MIN = 5;
const POS_MAX = 20;
// Below this the "ranking" is one person's stray search, not a signal.
const MIN_IMPRESSIONS = 10;
// A page younger than this is still settling - Google re-ranks new URLs for
// weeks, and refreshing mid-settle re-starts the clock for nothing.
const MIN_PAGE_AGE_DAYS = 21;
// After a refresh ships (or an update idea is rejected), the page sits out
// this long before it can be flagged again.
const COOLDOWN_DAYS = 45;
// How many update suggestions may be alive (pending/approved/in_progress) at
// once. Updates share the ONE daily build slot with new guides - a flood of
// them would silently pause new publishing.
const MAX_LIVE_UPDATES = 2;

export type RefreshDetectResult = {
  candidates: number;
  queued: number;
  live_updates: number;
  skipped?: string;
};

type PageRow = {
  id: string;
  url: string;
  title: string | null;
  primary_keyword: string | null;
  published_at: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const normUrl = (s: string | null | undefined) => (s ?? "").replace(/\/+$/, "").toLowerCase();

export async function detectRefreshCandidates(project: Project): Promise<RefreshDetectResult> {
  const client = db();
  const [gscRes, pagesRes, sugRes] = await Promise.all([
    client
      .from("gsc_stats")
      .select("date, top_queries")
      .eq("project_id", project.id)
      .order("date", { ascending: false })
      .limit(14),
    client
      .from("pages")
      .select("id, url, title, primary_keyword, published_at")
      .eq("project_id", project.id)
      .eq("type", "guide"),
    client
      .from("suggestions")
      .select("id, status, primary_keyword, spec, created_at, decided_at, completed_at")
      .eq("project_id", project.id)
      .eq("type", "update"),
  ]);

  if (gscRes.error) throw new Error(gscRes.error.message);
  if (pagesRes.error) throw new Error(pagesRes.error.message);
  if (sugRes.error) throw new Error(sugRes.error.message);

  const gsc = gscRes.data ?? [];
  if (gsc.length === 0) return { candidates: 0, queued: 0, live_updates: 0, skipped: "no GSC data yet" };

  const now = Date.now();
  const pages = ((pagesRes.data ?? []) as PageRow[]).filter(
    (p) =>
      p.published_at != null &&
      now - Date.parse(p.published_at) >= MIN_PAGE_AGE_DAYS * 86_400_000,
  );
  if (pages.length === 0) {
    return { candidates: 0, queued: 0, live_updates: 0, skipped: "no guides old enough to refresh" };
  }

  // ---- what's already flagged / recently handled -------------------------
  const sugs = (sugRes.data ?? []) as Array<{
    status: string;
    primary_keyword: string | null;
    spec: Record<string, unknown> | null;
    created_at: string;
    decided_at: string | null;
    completed_at: string | null;
  }>;
  const sugPageUrl = (s: (typeof sugs)[number]) =>
    normUrl((s.spec?.page_url as string | undefined) ?? null);
  const live = sugs.filter((s) => ["pending", "approved", "in_progress"].includes(s.status));
  // Cooldown reads every non-live update row - done AND rejected: a refresh
  // that shipped needs time to be re-measured, and an owner who said no must
  // not be re-asked nightly.
  const coolingUrls = new Set(
    sugs
      .filter((s) => !["pending", "approved", "in_progress"].includes(s.status))
      .filter((s) => {
        const t = s.completed_at ?? s.decided_at ?? s.created_at;
        return now - Date.parse(t) < COOLDOWN_DAYS * 86_400_000;
      })
      .map(sugPageUrl)
      .filter(Boolean),
  );
  const liveUrls = new Set(live.map(sugPageUrl).filter(Boolean));
  const liveKeywords = new Set(live.map((s) => norm(s.primary_keyword)).filter(Boolean));

  const slots = MAX_LIVE_UPDATES - live.length;
  if (slots <= 0) {
    return { candidates: 0, queued: 0, live_updates: live.length, skipped: "update queue full" };
  }

  // ---- fold the last 14 data days of GSC queries -------------------------
  // Impressions-weighted position, the same math analytics-data and the
  // briefing use, so this detector can never disagree with the dashboard
  // about where a query sits.
  const acc = new Map<string, { impressions: number; posWeight: number }>();
  for (const row of gsc) {
    for (const q of ((row.top_queries ?? []) as GscQueryStat[])) {
      const impr = q.impressions ?? 0;
      const a = acc.get(norm(q.query)) ?? { impressions: 0, posWeight: 0 };
      a.impressions += impr;
      a.posWeight += (q.position ?? 0) * impr;
      acc.set(norm(q.query), a);
    }
  }

  // ---- candidates: a page whose keyword's QUERY FAMILY sits in the band --
  // Exact matching misses how people actually search: a page keyed
  // "codex vs claude code" earns its impressions on "codex 5.6 vs claude
  // code" (live example, 2026-08-05 - position ~7, exact-match saw nothing).
  // A query belongs to the page's family when it contains EVERY token of the
  // primary keyword, with at most a few extra tokens (version numbers,
  // years, "best") - loose enough to catch variants, tight enough that
  // "claude code" never claims "why claude code beats every other agent".
  const MAX_EXTRA_TOKENS = 3;
  const tokens = (s: string) => s.split(/[^a-z0-9.]+/).filter(Boolean);
  type Candidate = { page: PageRow; query: string; position: number; impressions: number };
  const candidates: Candidate[] = [];
  for (const page of pages) {
    const url = normUrl(page.url);
    if (liveUrls.has(url) || coolingUrls.has(url)) continue;
    const kw = norm(page.primary_keyword);
    if (!kw || liveKeywords.has(kw)) continue;
    const kwTokens = tokens(kw);
    // Single-token keywords match far too promiscuously - exact only there.
    if (kwTokens.length === 0) continue;

    let impressions = 0;
    let posWeight = 0;
    let best: { query: string; impressions: number } | null = null;
    for (const [query, agg] of acc) {
      const qTokens = tokens(query);
      const inFamily =
        query === kw ||
        (kwTokens.length >= 2 &&
          qTokens.length <= kwTokens.length + MAX_EXTRA_TOKENS &&
          kwTokens.every((t) => qTokens.includes(t)));
      if (!inFamily) continue;
      impressions += agg.impressions;
      posWeight += agg.posWeight;
      if (!best || agg.impressions > best.impressions) best = { query, impressions: agg.impressions };
    }
    if (!best || impressions < MIN_IMPRESSIONS) continue;
    const pos = posWeight / impressions;
    if (pos < POS_MIN || pos > POS_MAX) continue;
    // target_query is the family's biggest real query - the string searchers
    // actually type - which may differ from the stored primary keyword.
    candidates.push({ page, query: best.query, position: pos, impressions });
  }

  // Biggest audience first - the refresh slot is scarce.
  candidates.sort((a, b) => b.impressions - a.impressions);
  const picked = candidates.slice(0, slots);
  if (picked.length === 0) {
    return { candidates: candidates.length, queued: 0, live_updates: live.length };
  }

  // Auto-approve projects delegated this call; the position band IS the
  // safety argument (the page already ranks - a refresh cannot mistarget the
  // way a new keyword can). Semi projects get a pending card with the
  // "Update existing page" badge.
  const status = effectiveAutomations(project).auto_approve ? "approved" : "pending";
  const rows = picked.map((c) => ({
    project_id: project.id,
    type: "update" as const,
    title: `Refresh: ${c.page.title ?? c.page.url}`,
    primary_keyword: c.query,
    rationale:
      `This page sits at ~#${c.position.toFixed(1)} for "${c.query}" with ` +
      `${c.impressions} impressions over the last ${gsc.length} data days. It already has ` +
      `Google's partial trust - closing its gaps against the current page 1 is the cheapest ` +
      `ranking move on the board (queued by the nightly refresh detector).`,
    spec: {
      source: "refresh-detect",
      page_url: c.page.url,
      page_title: c.page.title,
      target_query: c.query,
      current_position: Number(c.position.toFixed(1)),
      impressions_14d: c.impressions,
    },
    source: "refresh",
    status,
  }));
  const { error } = await client.from("suggestions").insert(rows);
  if (error) throw new Error(error.message);

  return { candidates: candidates.length, queued: rows.length, live_updates: live.length + rows.length };
}
