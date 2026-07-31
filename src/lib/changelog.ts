// The product changelog - what shipped in DispatchSEO itself, in the owner's
// language. Same serve-content-from-the-backend pattern as the agent
// instructions (src/lib/instructions/) and the backlink playbook: content IS
// state, it lives here, and every surface (the dashboard banner, /changelog,
// the get_changelog MCP tool) reads this one list.
//
// Adding a release: prepend an entry. `version` is the anchor id and the value
// stored in the "seen" cookie, so it must be unique and must never be reused
// or reordered - a returning owner is shown the banner exactly when the newest
// version differs from what their browser last acknowledged.
//
// Write for the owner, not the commit log: name the thing they'd notice, not
// the module that changed. Skip releases with nothing user-visible - a silent
// week is better than a banner about an internal refactor.

export type ChangeKind = "new" | "improved" | "fixed";

export type ChangelogEntry = {
  /** Unique, sortable, never reused: `YYYY-MM-DD`, or `YYYY-MM-DD.N` for a same-day second release. */
  version: string;
  /** ISO date the release went out. */
  date: string;
  /** Headline - a few words, sentence case. */
  title: string;
  /** One line for the banner: what changed, in the owner's terms. */
  summary: string;
  changes: { kind: ChangeKind; text: string }[];
};

// Newest first. The head of this list is what the banner announces.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2026-07-31",
    date: "2026-07-31",
    title: "Your automations use a lot less of your GitHub allowance",
    summary:
      "The dashboard now wakes your builders only when there is real work, instead of them " +
      "waking up three times a day to check. Same output, roughly a quarter less of your " +
      "monthly GitHub Actions allowance per site.",
    changes: [
      {
        kind: "improved",
        text:
          "Your site's automations used to run on their own timers, three attempts a day, " +
          "because GitHub sometimes drops a scheduled run. Two of those three woke up only " +
          "to find nothing to do - and GitHub charges your account a full minute every time " +
          "one starts. The dashboard now decides when there is something to build and wakes " +
          "the workflow itself, so that check costs nothing. Nothing about what gets " +
          "published changes.",
      },
      {
        kind: "improved",
        text:
          "If a wake-up call goes out and nothing runs, you hear about it. GitHub accepts " +
          "those calls even when a repo has Actions switched off or has run out of minutes, " +
          "so the dashboard now tracks each one until the workflow reports back, and flags " +
          "the ones that never do.",
      },
      {
        kind: "new",
        text:
          "A plain-English alert when GitHub pauses your builds. Running out of monthly " +
          "Actions minutes does not produce a bill or an email from GitHub - it just quietly " +
          "stops running your workflows. When it looks like that happened, the dashboard now " +
          "says so and links straight to the setting that fixes it.",
      },
      {
        kind: "new",
        text:
          "Up-front numbers on what a third site costs. Two sites fit inside GitHub's free " +
          "tier; past that GitHub charges you a few dollars a month directly, and we never " +
          "touch or mark up that money. The plans page, the FAQ and the docs now all say so, " +
          "and you get the exact figures when you add your third site.",
      },
    ],
  },
  {
    version: "2026-07-30.9",
    date: "2026-07-30",
    title: "Cancelling is a button now",
    summary:
      "Billing has a Cancel subscription button. It takes effect at the end of the period " +
      "you've already paid for, and you can undo it from the same place.",
    changes: [
      {
        kind: "new",
        text:
          "A Cancel subscription button on Billing. Two clicks, no email, no hunting through " +
          "the payment provider's site. Cancelling during your trial means you're never " +
          "charged at all.",
      },
      {
        kind: "new",
        text:
          "One optional question on the way out. The cancel screen asks what made you leave " +
          "and whether anything needs fixing - both skippable, and the cancel button works " +
          "with the whole thing left blank. Whatever you write goes straight to the person " +
          "who builds this.",
      },
      {
        kind: "new",
        text:
          "Cancel now, keep what you paid for. Your plan runs to the end of the current " +
          "period - sites keep being tracked and built the whole time - and Billing shows " +
          "the exact date it ends. Nothing is deleted when it does, so coming back later " +
          "picks up where you left off.",
      },
      {
        kind: "new",
        text:
          "Changed your mind? A Keep my plan button appears while a cancellation is pending, " +
          "so you can call it off without going through checkout again.",
      },
      {
        kind: "fixed",
        text:
          "A paused account now says so. If your plan ends or a payment fails, every dashboard " +
          "screen carries a banner explaining that tracking and building have stopped, that " +
          "nothing has been deleted, and how to start again. Until now the dashboard looked " +
          "completely normal and just quietly stopped updating.",
      },
    ],
  },
  {
    version: "2026-07-30.8",
    date: "2026-07-30",
    title: "DispatchSEO runs on Codex too",
    summary:
      "Codex now does everything Claude Code does here, including the overnight builder. " +
      "Pick one when you set a site up, or switch any time on Settings; nothing about an " +
      "existing Claude setup changes.",
    changes: [
      {
        kind: "new",
        text:
          "Codex is a full alternative to Claude Code. Setting up a new site now asks which " +
          "one you want, and Settings -> Project key has a tab per agent for sites you already " +
          "have. Either way it drives everything: research, the queue, approvals, backlinks, " +
          "reports, building a guide on request - and the scheduled builders that run " +
          "overnight without you.",
      },
      {
        kind: "new",
        text:
          "A Coding agent setting. Switch a site between Claude Code and Codex and it takes " +
          "effect on the next scheduled build - nothing to reinstall, no pull request, no repo " +
          "edit, because your workflow files already carry both and ask which to use when they " +
          "run. If the new agent's key isn't in place yet, the switch tells you right then " +
          "instead of letting you find out at 5am.",
      },
      {
        kind: "new",
        text:
          "An \"Other MCP client\" tab, for Cursor, Gemini CLI, Copilot, or anything else that " +
          "speaks MCP. It hands you the URL, the header, and a header-free URL for clients that " +
          "can't set one. Those connect and drive DispatchSEO by hand; the overnight builder " +
          "needs Claude Code or Codex.",
      },
      {
        kind: "improved",
        text:
          "The honest difference between the two is billing, and it is stated wherever you " +
          "pick: Claude Code runs on the subscription you already pay for, Codex is metered by " +
          "OpenAI per run. Either way the credential is yours and stays yours - DispatchSEO " +
          "never proxies or pools it.",
      },
      {
        kind: "fixed",
        text:
          "A Codex build that stops because your OpenAI account is out of credit now says so, " +
          "loudly, with the link to fix it. Codex reports that identically to a momentary rate " +
          "limit, so taking its word for it would have meant a green run every night that built " +
          "nothing - the builders ask OpenAI directly instead of guessing from the message.",
      },
    ],
  },
  {
    version: "2026-07-30.7",
    date: "2026-07-30",
    title: "Ask for what's missing",
    summary:
      "A Feedback board in the sidebar: ask for a feature in one line, and vote on what " +
      "everyone else asked for. The most wanted things get built first.",
    changes: [
      {
        kind: "new",
        text:
          "Feedback, at the bottom of the sidebar. Type what you're missing and hit enter - " +
          "that's the whole thing. Add detail if you want, or don't.",
      },
      {
        kind: "new",
        text:
          "Vote on anyone else's request. One vote each, click again to take it back, and " +
          "the board sorts by what people actually want. Requests get a status as they " +
          "move - planned, in progress, shipped - so you can see where yours went.",
      },
      {
        kind: "new",
        text:
          "Your agent can use the board too: get_feedback, submit_feedback and " +
          "vote_feedback over MCP, so you can ask for something without leaving the terminal.",
      },
    ],
  },
  {
    version: "2026-07-30.5",
    date: "2026-07-30",
    title: "Fewer ways to get stuck, and alerts that actually arrive",
    summary:
      "A pass over the paths that only break for someone who isn't us: the setup wizard, the " +
      "confirmation email, the failure alerts, and the jobs running in your repo.",
    changes: [
      {
        kind: "fixed",
        text:
          "Failure alert emails now send on Docker installs. They never had: the sender address " +
          "arrived empty rather than missing, so every alert was rejected on the way out and the " +
          "error only landed in the container log - while the docs told you no email meant " +
          "nothing was wrong. If you self-host and wired up Resend, you'll start hearing from it.",
      },
      {
        kind: "fixed",
        text:
          "Confirming your email works from a different device than you signed up on. The link " +
          "only worked in the browser that started the signup; anywhere else it confirmed your " +
          "address and then told you your password was wrong.",
      },
      {
        kind: "fixed",
        text:
          "A job in your repo that hangs and hits its time limit now reports that it failed. " +
          "A cancelled run is neither a success nor a failure to GitHub, so those runs told us " +
          "nothing at all - the one situation the time limit exists to catch was the one that " +
          "stayed invisible.",
      },
      {
        kind: "fixed",
        text:
          "Rank tracking waits quietly while your DataForSEO account is still unfunded instead " +
          "of reporting a broken job every night. Connecting the credentials and wiring the " +
          "deposit are two separate steps, and the gap between them is normal.",
      },
      {
        kind: "fixed",
        text:
          "The setup wizard says so when a step fails instead of leaving the button dead, the " +
          "repo picker always offers a way forward even when GitHub returns nothing, and " +
          "self-hosted installs get the pipeline install card on their first site.",
      },
    ],
  },
  {
    version: "2026-07-30.4",
    date: "2026-07-30",
    title: "Someone to ask, from wherever you're stuck",
    summary:
      "The Discord is now one click away from the setup wizard and from every page of the docs, instead of only from your settings page.",
    changes: [
      {
        kind: "new",
        text:
          "Setup has a link to the Discord in its header, next to the quick guide. Some of setup " +
          "depends on things no guide can check for you, like whether Google has verified your " +
          "property yet, and being stalled on step three is when you want a person rather than " +
          "another page to read.",
      },
      {
        kind: "new",
        text:
          "The docs carry the same link in their header and in the Help section of the sidebar, " +
          "so it's reachable from any page rather than only from the one that happens to mention " +
          "it. Troubleshooting and Common questions now point there first, with GitHub " +
          "Discussions kept for anything worth leaving behind for the next person.",
      },
    ],
  },
  {
    version: "2026-07-30.3",
    date: "2026-07-30",
    title: "Better keywords, and automatic mode stops asking you things",
    summary:
      "Your site now competes in whichever description of your product it can actually win, instead of the most obvious and most crowded one - and on automatic mode you're never asked to approve anything again.",
    changes: [
      {
        kind: "new",
        text:
          "Your product can be described honestly in several ways, and they are not equally " +
          "winnable. A tool for SEO sits in a market Ahrefs and Semrush have published into since " +
          "2011; the same tool described as \"an agent that does the work unattended\" sits in a " +
          "market two years old. Research now measures each description against your site's " +
          "current strength every week, spends the week on the one you can actually win, and " +
          "prints the numbers so you can see why it chose. Setup writes those descriptions down " +
          "for your site - re-run it from your dashboard to get them.",
      },
      {
        kind: "improved",
        text:
          "It sticks with one subject rather than hopping between them. Twenty guides spread over " +
          "five subjects makes you an authority on none; twenty inside one build a cluster where " +
          "every page lifts the others. It moves on only when a subject is genuinely used up.",
      },
      {
        kind: "improved",
        text:
          "On automatic mode you are never asked to approve anything, and nothing sits in limbo " +
          "either. Ideas are decided when they're researched - approved or dropped, with the reason " +
          "recorded - rather than parked \"until your site is stronger\", which on a new site means " +
          "months away and possibly never. The decision uses the page-1 check it already paid for: " +
          "if nobody established was ranking there, it goes ahead, even when the data provider " +
          "returned no difficulty score at all. A missing score is a missing guess about a page " +
          "we already looked at.",
      },
      {
        kind: "improved",
        text:
          "Some weeks that means 4 guides instead of 7. It won't pad your queue with keywords it " +
          "doesn't believe in, and it won't hand you the difference to sort out either.",
      },
      {
        kind: "improved",
        text:
          "A difficulty score is now only the first pass. If it checks page 1 for a keyword and " +
          "finds nobody established sitting there, it goes ahead even when the score called the " +
          "keyword too hard for your site - because what it actually saw beats what the score " +
          "guessed. Scores are calculated from links, and they read far too high on exactly the " +
          "searches a new site can still win. This is how bigger keywords reach your queue " +
          "without lowering the bar, and it costs nothing extra: it already looks at page 1.",
      },
      {
        kind: "fixed",
        text:
          "Keyword suggestions were coming back wrong for anyone on our hosted plan - we were " +
          "asking our data provider for keywords in the same shopping CATEGORY as yours rather " +
          "than keywords that actually mean the same thing, and asking for English never filtered " +
          "out other languages. A search about SEO automation could return French ad agencies. " +
          "Now it asks the two right ways, merges them, and throws out anything non-English or " +
          "with no search traffic - with a test that fails if that ever regresses.",
      },
    ],
  },
  {
    version: "2026-07-30",
    date: "2026-07-30",
    title: "Fixed: the daily builder could die before it started",
    summary:
      "If your package.json pins a pnpm version, your builder was failing in 13 seconds on every run - and failing too early to tell anyone. Re-run the setup command from your dashboard to pick up the fix.",
    changes: [
      {
        kind: "fixed",
        text:
          "The workflows DispatchSEO installs in your repo set up pnpm before building. That step " +
          "passed a pnpm version, and if your package.json also pins one (a \"packageManager\" " +
          "field), the setup action refuses to run at all - so the builder died at step two of " +
          "every run, before it wrote a line. Nothing was lost and nothing was published wrong; " +
          "the builds simply never happened. The workflow now reads your pin and matches it, and " +
          "only picks a version itself when you have not pinned one.",
      },
      {
        kind: "fixed",
        text:
          "It also failed BEFORE the step that reports problems to your dashboard, so the banner " +
          "and the alert email stayed quiet - you would only have seen it in GitHub's own emails. " +
          "The stale-run check would have caught the silence within 36 hours, which is the backstop " +
          "working but slower than it should be.",
      },
      {
        kind: "improved",
        text:
          "The cause was a workflow comment asking whoever ran your install to delete a line by " +
          "hand when your repo pinned a version - so getting it right depended on that being " +
          "noticed. Nothing we install in your repo is allowed to work that way any more: the " +
          "workflows decide for themselves when they run, and two new checks on our side refuse " +
          "to ship a workflow that needs hand-editing or that has never been proved to start.",
      },
      {
        kind: "fixed",
        text:
          "To pick this up, re-run the setup command from your dashboard - your repo keeps the " +
          "version of the pipeline it installed, and the daily health check will also tell you an " +
          "update is waiting.",
      },
    ],
  },
  {
    version: "2026-07-29.6",
    date: "2026-07-29",
    title: "The queue tells you why an idea is waiting",
    summary:
      "An idea research didn't approve now says \"pending\" and shows the number behind it, instead of \"optional\" - because on a young site nothing else will ever pick it up.",
    changes: [
      {
        kind: "improved",
        text:
          "On Auto, an idea research proposed but didn't approve used to read \"optional\", with an " +
          "\"Add\" button - as if it were a bonus you could ignore. It isn't: research now refuses " +
          "to promote borderline keywords just to hit the weekly count on a site with no backlinks " +
          "yet, so approving is the only thing that ever builds them. The row says \"pending\" and " +
          "names the reason - \"KD 17, over your ceiling of 10\" - and the button says Approve.",
      },
    ],
  },
  {
    version: "2026-07-29.5",
    date: "2026-07-29",
    title: "Your posts stay about what you sell",
    summary:
      "Research now throws out keywords your product isn't actually an answer to - the ones your buyers search about the other tools they use, which read as a perfect fit and bring in people who never needed you.",
    changes: [
      {
        kind: "improved",
        text:
          "A keyword now has to pass one question before anything else: written well, would this " +
          "post end with \"and that's what your product does\"? If the product can only show up as " +
          "a footnote or a \"here's how we built ours\" aside, the keyword is dropped - no matter " +
          "how good the search volume, the difficulty score, or the fit with your audience.",
      },
      {
        kind: "improved",
        text:
          "The rule this replaces asked whether your audience would search the keyword, and your " +
          "audience searches a hundred things a week you're not the answer to - their editor, " +
          "their cloud, their framework, the agent they run you with. Those all passed, and each " +
          "one is a post that ranks for someone else's question. Every idea now has to name the " +
          "problem the searcher has, not who the searcher is.",
      },
      {
        kind: "improved",
        text:
          "Setup now writes down your marketing surface - your landing page, your README - " +
          "alongside your code, because that's where the research reads what your site is " +
          "actually about. If your site facts file was written before today it probably lists " +
          "code only, which is exactly how a run drifts into writing about your plumbing. " +
          "Re-run setup from the dashboard to refresh it.",
      },
    ],
  },
  {
    version: "2026-07-29.4",
    date: "2026-07-29",
    title: "Your posts can start linking to each other",
    summary:
      "Turn it on and every new guide also adds a link from 2-3 of your closest older posts, so the whole set pulls together instead of each post standing alone.",
    changes: [
      {
        kind: "new",
        text:
          "New guides have always linked out to your older ones, but nothing ever linked back - " +
          "so your oldest posts, usually your best, collected no internal links at all. There's " +
          "now a switch on the Automations page: when it's on, the same pull request that adds a " +
          "guide also edits 2-3 of your closest existing posts so they link to it. It only ever " +
          "wraps words that are already in a sentence you wrote - strip the link out and the text " +
          "reads exactly as before - so your writing is never reworded, extended, or tidied.",
      },
      {
        kind: "new",
        text:
          "It's off until you turn it on, and it stays that way if you never do. This is the only " +
          "thing DispatchSEO does that changes pages you already published, so it doesn't ride " +
          "along with Semi or Auto - it's a separate yes. Once it's on it stays out of your way: " +
          "the links ride in the same pull request as the new guide, which merges under whatever " +
          "rules you already had. No extra pull requests, nothing new to approve.",
      },
      {
        kind: "new",
        text:
          "A post that's already carrying 5 links to other guides gets left alone from then on. " +
          "Without that, your most on-topic post would get picked build after build and slowly " +
          "fill with links - which is the thing that makes automatic linking backfire.",
      },
    ],
  },
  {
    version: "2026-07-29.3",
    date: "2026-07-29",
    title: "The setup banner stops nagging sites that are already running",
    summary:
      "A live site no longer claims it's still setting up, and every setting your agent can pass now explains what it's for.",
    changes: [
      {
        kind: "fixed",
        text:
          "The \"Setting up your site in the background\" banner no longer appears on a site " +
          "that's clearly already running. It was keyed on a marker that older projects never " +
          "got, and reconnecting your GitHub App reset the timer that was supposed to hide it - " +
          "so a site publishing guides every day could be told it was still being set up. It now " +
          "goes by whether your site has real data, which settles it regardless of any marker.",
      },
      {
        kind: "improved",
        text:
          "Every setting your agent can pass now explains what it's for. Previously the agent had " +
          "to infer what belonged in each field from the surrounding description, which Claude " +
          "handles well and other agents handle less well. All 111 of them are now spelled out.",
      },
    ],
  },
  {
    version: "2026-07-29.2",
    date: "2026-07-29",
    title: "No more duplicate ideas, and reconnecting GitHub actually sticks",
    summary:
      "The same keyword can't get queued twice any more, and the \"Reconnect the GitHub App\" card now clears when you reconnect.",
    changes: [
      {
        kind: "fixed",
        text:
          "A keyword that's already in your queue can't be added again - not by a research " +
          "run, not by the Add idea form. Before this, a run that re-proposed a keyword you " +
          "had already approved put the same guide in the queue twice, and two builders would " +
          "write two competing pages for one search. You now get a plain \"already in the " +
          "queue\" answer instead, naming the idea that's already there.",
      },
      {
        kind: "fixed",
        text:
          "Reconnecting the GitHub App from the Home card now saves. If the app was already " +
          "installed on your GitHub account, GitHub sent you back through a path that bounced " +
          "you to the dashboard without recording anything - so the card kept nagging no " +
          "matter how many times you reconnected. Connecting a second site on the same GitHub " +
          "account works now too.",
      },
    ],
  },
  {
    version: "2026-07-29.1",
    date: "2026-07-29",
    title: "Keyword picking now learns from your own results",
    summary:
      "Research reads how your published pages are actually doing in Google and lets that steer the next round - and it stopped queueing keywords a young site can't win.",
    changes: [
      {
        kind: "new",
        text:
          "Every research run now starts by looking at the pages it already published - " +
          "what ranked, what stalled past position 50, what got impressions but no clicks - " +
          "and carries that into which keywords it picks next. It writes the conclusion into " +
          "the run report, so you can see what it learned. Previously each run started from " +
          "scratch and had no idea whether its last twenty picks worked.",
      },
      {
        kind: "fixed",
        text:
          "Difficulty scores read far too low on commercial searches like " +
          "\"<competitor> alternative\" or \"best X\", where page 1 is five established brands " +
          "winning on reputation rather than links - so those keywords looked easy, got " +
          "queued, and the pages landed on page 8. Research now counts the established " +
          "players on page 1 and drops the keyword at four or more, whatever the difficulty " +
          "score claimed.",
      },
      {
        kind: "fixed",
        text:
          "Hitting the weekly target of 7 guides was allowed to push borderline keywords " +
          "through on a site with no authority yet. You still get one guide a day - that " +
          "hasn't changed - but research now gets there by hunting wider instead of settling: " +
          "it mines the queries you already show up for in Search Console, error messages, " +
          "new releases in your space, and your trend radar, and screens twice as many " +
          "candidates before it will call a week short.",
      },
      {
        kind: "improved",
        text:
          "Search volume now has an upper limit that grows with your site, not just a floor - " +
          "but a big keyword whose page 1 is still thin no longer gets thrown out for being " +
          "big. In a fast-moving topic, a query can have thousands of searches while nobody " +
          "has published the real answer yet; those are the best openings a new site gets, " +
          "so what's already on page 1 decides, not the volume number.",
      },
      {
        kind: "improved",
        text:
          "Research won't invent a pattern from two lucky posts. It now waits until at least " +
          "10 of your pages have had three weeks to settle before drawing any conclusion from " +
          "how they're doing, and says \"not enough data yet\" until then.",
      },
      {
        kind: "improved",
        text:
          "Page-1 checks are capped at 25 per research run, spent on the strongest candidates " +
          "first. They're the priciest thing a run does, so a hard week now costs a known " +
          "amount instead of running up your bill.",
      },
    ],
  },
  {
    version: "2026-07-29",
    date: "2026-07-29",
    title: "The tool queue fills itself",
    summary:
      "Every weekly research run now queues tool ideas, not just guides - and if your site has no public tools section yet, the first tool build creates one.",
    changes: [
      {
        kind: "fixed",
        text:
          "Sites that finished setup without a public tools section got tool ideas skipped " +
          "week after week, so the tool queue stayed empty and the weekly tool builder had " +
          "nothing to ship - quietly, with no warning anywhere. The research run now queues " +
          "1-2 tool ideas every week regardless, and reports it when none clears the bar.",
      },
      {
        kind: "new",
        text:
          "The tool builder creates your tools section itself the first time it runs - " +
          "registry, tools index, and the page template - in the same PR as the first tool. " +
          "If /tools is already your app's own screen, it publishes at /free-tools instead " +
          "and leaves your routes alone.",
      },
      {
        kind: "improved",
        text:
          "Setup now looks for (or scaffolds) a tools home the same way it does your blog, " +
          "so new projects start able to publish tools on day one.",
      },
      {
        kind: "fixed",
        text:
          "Tool validation used to assume every tool lives at /tools/<slug>; it now reads " +
          "the real path from the PR, so tools published anywhere else get tested instead " +
          "of failing on a 404.",
      },
    ],
  },
  {
    version: "2026-07-28.2",
    date: "2026-07-28",
    title: "The launch-day audit sweep",
    summary:
      "A full audit of the self-host path: Windows connect is now immune to a known Claude Code header bug, free mode builds without a SERP source, and a dozen edge cases got hardened.",
    changes: [
      {
        kind: "new",
        text:
          "Your project key can now ride in the connect URL itself (?key=...) - the Windows " +
          "connect command uses this, sidestepping a long-standing Claude Code bug where a " +
          "configured auth header is silently dropped on Windows.",
      },
      {
        kind: "fixed",
        text:
          "Free mode (no DataForSEO, no SerpApi) no longer stalls the builder at the SERP " +
          "gate - guides and tools build from Search Console data and product knowledge, and " +
          "say so in the PR.",
      },
      {
        kind: "fixed",
        text:
          "On plain-HTTP installs (localhost, LAN, VPS before HTTPS), Settings and the " +
          "dashboard no longer hand out https:// connect commands that can't connect.",
      },
      {
        kind: "fixed",
        text:
          "Trend radar on a localhost install now says plainly that it needs a public " +
          "address instead of reporting a scan that could never arrive.",
      },
      {
        kind: "improved",
        text:
          "Self-host hardening: schedules survive Windows checkouts (line-ending pin), " +
          "hand-edited .env files are CRLF-normalized on boot, a rotated Claude token " +
          "reaches the builder without a restart, and hung GitHub calls can no longer " +
          "wedge the build loop.",
      },
    ],
  },
  {
    version: "2026-07-28",
    date: "2026-07-28",
    title: "Windows works out of the box",
    summary:
      "Every command DispatchSEO asks you to paste now has a Windows (PowerShell) version, and the connect prompt names your project's server exactly.",
    changes: [
      {
        kind: "new",
        text:
          "Install and restart from plain PowerShell: the quickstart has a Windows paste, and " +
          "start.cmd in the install folder boots the stack from any Windows terminal (or a " +
          "double-click) - no Git Bash needed.",
      },
      {
        kind: "improved",
        text:
          "Commands the wizard and dashboard ask you to paste on your own computer now show " +
          "Mac/Linux and Windows (PowerShell) tabs, defaulting to your system, and the final " +
          "wizard step spells out where each paste goes.",
      },
      {
        kind: "fixed",
        text:
          "The 'paste into Claude Code' prompt named a server (seo-manager) that doesn't match " +
          "what the connect command registers (dispatchseo-<your site>), so a fresh agent " +
          "session could refuse to start. Every prompt now uses your project's exact server name.",
      },
    ],
  },
  {
    version: "2026-07-27.3",
    date: "2026-07-27",
    title: "Your queue refills itself, and setup tells the truth",
    summary:
      "The builder no longer sits idle when the idea queue empties, and the jobs that used to fail quietly now say so.",
    changes: [
      {
        kind: "new",
        text:
          "If your guide queue ever runs empty, research now starts on its own instead of " +
          "waiting for the next weekly run - so a delayed or dropped schedule can't cost you " +
          "a day's post. Still at most one research run a day.",
      },
      {
        kind: "fixed",
        text:
          "Approving a tool, or connecting a brand-new site, could silently do nothing for the " +
          "rest of the day if that day's scheduled run had already happened. Both start " +
          "immediately now.",
      },
      {
        kind: "fixed",
        text:
          "If the GitHub app loses access to your repo, the dashboard now tells you and links " +
          "the fix. Before, merges and approvals just stopped working with nothing to see.",
      },
      {
        kind: "fixed",
        text:
          "Setup could drop you on the final screen having skipped Search Console, your keyword " +
          "source and publish mode. It now resumes exactly where you left off.",
      },
      {
        kind: "improved",
        text:
          "Self-hosted installs: the dashboard is now reachable only from the machine running " +
          "Docker unless you deliberately open it up, matching what the VPS guide always said.",
      },
    ],
  },
  {
    version: "2026-07-27.2",
    date: "2026-07-27",
    title: "Rank tracking that never runs out of budget",
    summary:
      "Smarter, much cheaper SERP checks - and if spend ever runs hot, tracking slows down instead of stopping.",
    changes: [
      {
        kind: "improved",
        text:
          "Rank checks moved to a smarter schedule: keywords ranking in the top 30 are still " +
          "checked every day, and everything gets a full-depth sweep (including Google AI " +
          "Overview citations) every Monday. Same charts, a fraction of the DataForSEO cost.",
      },
      {
        kind: "new",
        text:
          "Budget pacing: if a project's DataForSEO spend is on track to hit its monthly " +
          "budget, checks automatically thin to every-other-day (then weekly) instead of " +
          "cutting out mid-month. The Billing page shows when pacing is active.",
      },
      {
        kind: "improved",
        text:
          "Domain Rating now refreshes weekly - it moves on a monthly scale, and the daily " +
          "re-check was paid money for a number that almost never changed overnight.",
      },
    ],
  },
  {
    version: "2026-07-27",
    date: "2026-07-27",
    title: "A nudge to install Claude for Chrome",
    summary:
      "The \"Get it on Google\" card now points new users at the Chrome extension it needs.",
    changes: [
      {
        kind: "improved",
        text:
          "The indexing card links straight to the Claude for Chrome install page the first " +
          "time it shows up, so the paste-and-go step actually works on the first try.",
      },
    ],
  },
  {
    version: "2026-07-26.4",
    date: "2026-07-26",
    title: "Setup can't touch the wrong site",
    summary:
      "Opening the setup page no longer starts installing into a site you didn't pick.",
    changes: [
      {
        kind: "fixed",
        text:
          "Opening the setup page could start installing the pipeline into whichever site DispatchSEO happened to think was active - committing files and writing a secret to that site's repo without anyone pressing a button. It happened because a site with no saved setup progress landed straight on the final screen, which starts the install by itself. Setup now opens on the Connect GitHub step instead, and only reaches the finish line if you actually walked there.",
      },
      {
        kind: "fixed",
        text:
          "Choosing a repo, saving your Claude token, and installing the pipeline now each name the site they're for. Before, they used whichever site was active, so a stale browser session could have pointed your token or your repo at the wrong one.",
      },
    ],
  },
  {
    version: "2026-07-26.3",
    date: "2026-07-26",
    title: "Deleting a site now actually ends it",
    summary:
      "Deleting a project takes DispatchSEO back out of the connected repo instead of leaving its workflows running.",
    changes: [
      {
        kind: "fixed",
        text:
          "Deleting a project only ever deleted our side of it. The workflows we committed to your repo kept running on schedule, failing against a project that no longer existed, and emailing you about it - with an error blaming DispatchSEO rather than the delete you asked for. Deleting now disables and removes those workflows, the .dispatchseo files, and the SEO_MCP_API_KEY secret.",
      },
      {
        kind: "improved",
        text:
          "Your content is never part of that cleanup. Published guides and tools, the page templates the setup run built, and your sitemap wiring all stay exactly where they are - only our machinery is removed.",
      },
      {
        kind: "new",
        text:
          "Moving a site to another DispatchSEO install? Tick \"leave the repo alone\" when you delete, and the pipeline keeps working while the old project goes away.",
      },
      {
        kind: "improved",
        text:
          "Closing your account cleans out every connected repo the same way, and tells you on the way out if any repo could not be reached.",
      },
    ],
  },
  {
    version: "2026-07-26.2",
    date: "2026-07-26",
    title: "Getting in, and getting out",
    summary:
      "Sign-up and confirmation links actually work now, Settings says which account you're in, and you can close the account yourself.",
    changes: [
      {
        kind: "fixed",
        text:
          "Signing up with an address that already had an account showed \"check your inbox\" for an email that was never sent. It now says the account exists and points you at signing in.",
      },
      {
        kind: "fixed",
        text:
          "The confirmation link in that email dropped you on the homepage instead of signing you in. It now takes you straight into your dashboard.",
      },
      {
        kind: "fixed",
        text:
          "\"Continue with Google\" quietly reused whichever Google account you last signed in with, so a second account could land you in the first one. It asks which account now.",
      },
      {
        kind: "new",
        text: "Settings shows which account you're signed in as.",
      },
      {
        kind: "new",
        text:
          "You can close your account from Settings. It cancels your plan first and removes your sites, and if the cancellation doesn't go through, nothing is deleted.",
      },
      {
        kind: "improved",
        text:
          "Deleting your only site now warns you that it doesn't cancel your plan, and with no sites left the sidebar stops offering links that bounce you back to the wizard.",
      },
    ],
  },
  {
    version: "2026-07-26",
    date: "2026-07-26",
    title: "A shorter, clearer setup",
    summary: "One less screen to click through, and the GitHub step now says what it actually does.",
    changes: [
      {
        kind: "improved",
        text:
          "Setup no longer stops to show you the keys it generated - you go straight into the wizard. Both keys are on Settings whenever you want them.",
      },
      {
        kind: "improved",
        text:
          "The GitHub step is called Connect GitHub, and it's honest about skipping: on a Docker install the bundled builder needs that token to reach your repo at all.",
      },
      {
        kind: "fixed",
        text:
          "Reinstalling on a site whose repo was already set up used to leave setup waiting forever. It now finishes on its own.",
      },
      {
        kind: "fixed",
        text:
          "Self-hosted auto-merge now holds back any pull request that touches files outside your publishing folders, matching what the hosted version has always done.",
      },
    ],
  },
  {
    version: "2026-07-25",
    date: "2026-07-25",
    title: "Updates apply themselves",
    summary:
      "Pipeline updates now install in the background instead of asking you to do anything.",
    changes: [
      {
        kind: "improved",
        text:
          "When your site repo's SEO workflows fall behind, we push the new version through the DispatchSEO GitHub App automatically - no prompt to paste, no banner to read.",
      },
      {
        kind: "new",
        text: "This changelog, plus a heads-up on the dashboard whenever something ships.",
      },
      {
        kind: "improved",
        text: "Signed in already? The landing page sends you straight to your dashboard.",
      },
    ],
  },
  {
    version: "2026-07-24",
    date: "2026-07-24",
    title: "A calmer dashboard",
    summary: "Quieter onboarding, a new look, and failure emails that actually reach you.",
    changes: [
      { kind: "new", text: "New pixel-art walkie mark across the app, favicon, and share images." },
      {
        kind: "new",
        text: "One background-work banner during first run, replacing the pile of setup cards - and Log out is finally in the sidebar.",
      },
      {
        kind: "improved",
        text: "Switching projects shows a loading state instead of appearing to freeze.",
      },
      {
        kind: "fixed",
        text: "When a background job fails on a hosted project, the email goes to you, not just to us.",
      },
      {
        kind: "fixed",
        text: "No more false \"your secrets are wrong\" alerts while setup is still running.",
      },
    ],
  },
  {
    version: "2026-07-23",
    date: "2026-07-23",
    title: "Get in while setup runs",
    summary: "The dashboard opens as soon as your repo is connected, mid-setup.",
    changes: [
      {
        kind: "new",
        text: "Connect the repo and start exploring - a top banner tracks the setup run instead of locking you out until it finishes.",
      },
      {
        kind: "fixed",
        text: "Search Console on hosted projects syncs through your own Google connection, so your data lands even without granting us service-account access.",
      },
      {
        kind: "fixed",
        text: "Email confirmation links land on the right page instead of a 404.",
      },
    ],
  },
];

export const LATEST = CHANGELOG[0];

/** Anchor id for an entry - `/changelog#v-2026-07-25`. */
export function anchorFor(version: string): string {
  return `v-${version}`;
}

export const CHANGELOG_COOKIE = "ds_whats_new";

// Versions are echoed back from the client (the dismiss action) and used as
// cookie values, so they get the same shape check both ways.
export function isVersionString(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.\d+)?$/.test(v);
}

// Whether to announce a release to this visitor. Two ways to stay quiet:
//   - they've already acknowledged this version (the cookie), or
//   - the release predates their project, so it isn't news to them - a brand
//     new signup should not be greeted with "DispatchSEO has been updated!".
// The cookie is per-browser, not per-account: a returning owner on a new
// device may see one release announced twice. That's the cheap tradeoff for
// not putting a per-user row behind this.
export function unseenRelease(
  seenVersion: string | undefined,
  projectCreatedAt: string | null | undefined,
): ChangelogEntry | null {
  const latest = LATEST;
  if (!latest) return null;
  if (seenVersion && seenVersion >= latest.version) return null;
  if (projectCreatedAt) {
    const created = new Date(projectCreatedAt).getTime();
    // Compare against the end of the release day: an entry dated the same day
    // the project was created still counts as pre-existing.
    const released = new Date(`${latest.date}T23:59:59Z`).getTime();
    if (Number.isFinite(created) && created > released) return null;
  }
  return latest;
}
