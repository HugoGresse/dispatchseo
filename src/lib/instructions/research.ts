// The weekly keyword-research workflow: product-knowledge-first candidate
// derivation, validation against the quality bar, and topping the queue up to
// the weekly quota. Generalized from the original clockedcode skill - the
// product surface to read comes from the repo's conventions file.

// Plain-English step summary for the dashboard's Instructions page. Edit it
// together with the markdown below - they describe the same pipeline.
export const RESEARCH_STEPS = [
  { title: "Review", plain: "Looks at how the pages it already published are actually doing in Google - what ranked, what stalled - and lets that steer this week's picks. It waits until at least 10 pages have had three weeks to settle before drawing any conclusion, so it can't invent a pattern from two lucky posts." },
  { title: "Learn", plain: "Re-reads what your product actually is, from your repo, every single run." },
  { title: "Derive", plain: "Asks: what would someone google right before your product is the answer? 40-60 candidates, hunting buying-intent first (comparisons, 'best X', alternatives) rather than 'what is X' traffic that never converts - but the quality bar still decides what makes it in." },
  { title: "Validate", plain: "Checks real search volume and difficulty - keywords outside your site's league get dropped, including the ones that are too BIG. Until your site has some authority, a smaller query you can win beats a huge one you can't." },
  { title: "Inspect", plain: "Eyeballs page 1 for each survivor and counts who's already there. Four or more established players and it's dropped, however easy the difficulty score claimed it was - that score is often wrong, and the actual page 1 isn't. Capped at 25 of these checks a run, spent on the best candidates first, so a hard week can't run up your bill." },
  { title: "Queue", plain: "Fills the week's tank so the builder ships one guide a day, and gets there by hunting wider - your existing Search Console queries, error messages, new releases, trend topics - instead of by lowering the bar. Never filler to hit the number." },
  { title: "Tools", plain: "Every run also leaves a tool idea or two in the tool queue - the weekly tool builder has nothing to ship otherwise. A site that has no public tools page yet still gets ideas queued; the first tool build creates the page." },
];

export const RESEARCH = `## Workflow: research <topic?>

### Method - product knowledge FIRST (the moat)

Never start from a generic seed list. Start from what {{SITE_NAME}} IS, read
fresh from the repo at research time, so the research evolves with the
product:

0. **Read what already happened (the learning step - never skip it).** Call
   \`get_overview\` and look at the \`guides\` and \`tools\` arrays: every page
   this pipeline already shipped, with its real clicks, impressions and
   average position. Pages published in the last ~3 weeks are still settling -
   weigh them lightly - but anything older is a graded answer to "did our
   targeting work?", and it is the only honest evidence this run has.

   Bucket the pages that have had time to settle by the traits recorded on
   their suggestion (\`get_suggestions\` with status "done" carries
   \`keyword_volume\`, \`keyword_difficulty\`, the intent class in the
   rationale, and \`serp_notes\`), and answer three questions in writing:
   - Which traits produced pages now sitting in the top 20?
   - Which produced pages stuck past position 50, or with impressions but no
     clicks? Those are the patterns to STOP repeating.
   - Where the two disagree with the reported KD, trust the observed
     positions. Real outcomes on this domain beat any vendor's difficulty
     score.

   Carry the answer into step 2 as a concrete steer ("comparison long-tails
   under 800 volume are landing top-20; the commercial 'alternative' terms
   are stuck past 80 - hunt the former, drop the latter this run"). State the
   steer in the run report so the owner can see the loop is closing.

   **Minimum sample - do not pattern-match on noise.** A "settled" page is one
   published **21+ days** ago. Count them:
   - **Fewer than 10 settled pages: REPORT ONLY.** Write down what you see
     ("3 of 6 settled pages are past position 50") but derive NO targeting
     rule from it and pass NO steer to step 2. Two pages sharing a trait is a
     coincidence, and a confident rule invented from n=3 is worse than no
     rule at all - it will bias every run that follows while looking like
     evidence. Say "outcome data too thin to steer (N settled pages, need
     10)" and move on.
   - **10 or more: steer normally**, as above.
   - A trait needs at least **3 settled pages** behind it before it can
     support a conclusion, however clean the pattern looks.

   On a site with no settled pages at all, say "no outcome data yet - first
   runs" and move on. This step gets sharper every week; once past the
   threshold it should be the single biggest influence on what gets queued.
1. **Read the product surface** (skim, do not deep-read): the product-surface
   files listed in the conventions file, plus the existing content
   inventory - published slugs in the guides directory and the tools
   registry, cross-checked against \`get_pages\` (never propose duplicates).
2. **Derive candidate queries** from that knowledge: what would someone
   google right before {{SITE_NAME}} is the answer? Setup pains,
   feature-by-feature questions, comparisons, error messages, "best X for Y",
   generator/checker intents. Aim for 40-60 candidates across both content
   types - the quota ladder's rung 1 requires 40 to carry real volume/KD
   numbers before a run may come back short, so deriving fewer guarantees a
   miss. If a topic argument was given, scope this step to that topic;
   otherwise cover the whole product.
   **Intent - hunt buying-adjacent FIRST.** Traffic that never converts is
   the #1 way an SEO program wastes a month: easy informational queries
   ("what is X", "X meaning") pile up impressions and zero revenue. So
   commercial and comparison intent is where you look first and what breaks a
   tie: "X vs Y", "best X for <use case>", "X alternatives", "X pricing",
   "how to <job the product does>", "X for <audience>". Roughly half the
   run's ideas landing there is a healthy week.
   **That is a direction, never a quota, and it NEVER outranks the quality
   bar.** The bar decides what MAY be queued - intent only decides what you
   hunt for and which of two passing candidates wins. So: never stretch the
   KD ceiling, never soften the volume floor, and never talk yourself into a
   me-too page because the keyword smells commercial. Equally, never pad the
   queue with informational filler to hit a number. If this week's niche and
   your current KD ceiling honestly yield two commercial keywords, queue the
   two and say so in the report.
   **It rises on its own.** The KD ceiling scales with the site's DR, and DR
   is exactly what puts the harder commercial terms in range - so the mix
   should climb over months with nobody touching this rule. If it is NOT
   climbing while DR grows, that means hunt WIDER (autocomplete phrasings,
   comparison framings, use-case and audience angles, long-tails of pages
   already ranking) - the same instinct as the quota rule below: expand the
   search, never the bar.
   Tag each candidate with its intent class (commercial | comparison |
   informational | transactional) - the tag rides into the rationale at
   step 5 and into the run report, so the real mix is always visible.
   **Sweep for tool-shaped queries as its own pass, every run.** Guide
   candidates crowd out tool candidates when both come from one list, and the
   tool queue then sits empty for months. So run a separate, explicit sweep
   for queries that imply DOING something -
   generate / build / create / check / test / validate / calculate /
   estimate / convert / compare / pick - plus the jobs the product's own
   users do by hand today (config files, boilerplate, sizing decisions,
   audits). Aim for 5-10 tool candidates in every run; they carry into the
   same validation and SERP steps as guides.
3. **Validate with the research source** (see the data-tools section):
   volume + KD for the candidates where available (batch where possible).
   Apply the quality bar.
4. **Eyeball the SERP** for the survivors: is page 1 winnable? Note weak
   spots (forums, thin listicles, outdated posts) in serp_notes.
5. **Persist**: \`track_keywords\` the winners, then \`propose_suggestion\`
   for the best ones with a real rationale and a spec brief, following the
   queue policies (guides build-first, tools approve-first behind the
   project's tool-approval gate). Every
   rationale NAMES the query's intent class, and an informational idea says
   in one clause what it is doing for the site - feeding a commercial cluster
   through internal links, or claiming a term in AI answers. (Both are real
   jobs. This is labelling, not a tribunal: a strong informational keyword
   that passes the bar is a good week's work.) Tool ideas
   include a conversion rationale in \`rationale\`, the intended widget
   functionality in \`spec\`, and an \`archetype\` field in \`spec\`
   (wizard | calculator | analyzer | library - see the build-tool workflow's
   archetype table) so the builder knows the intended interaction pattern up
   front.
   **A site with no public tools page yet is NOT a reason to skip tool
   ideas.** Some conventions files say tools are "not wired yet" or name no
   tool surface at all - that describes the repo on the day setup ran, not a
   policy. The build-tool workflow scaffolds the tools home (registry, index,
   page template) inside its first PR, so the missing surface is the FIRST
   tool build's job, not a reason for an empty queue. Queue the ideas; note
   in the run report that the first build will create the tools section.

### Weekly quota - the queue guarantee

The consumers run at the site's own pace: the guide builder ships at most
ONE guide per day - up to **7 guides per week** - and the tool builder ONE
approved tool per week. That cadence is a PROMISE to the owner, and this
run is the only thing that fills the tank - so the run may not end short
while ladder rungs remain. Target: end the run with **7 approved guides**
and **1-2 tool ideas** in the queue - propose each tool idea, then
\`update_suggestion(id, status="approved")\` it like a guide; on projects
that gate tool concepts the backend records that as pending for the owner,
which counts (see the queue policies). Count what is already queued first
(\`get_suggestions\` for approved and pending) and top up the DIFFERENCE -
never overfill past ~9 approved guides or ~2 queued tools.

**The tool slot is not optional - it is half the promise.** The dashboard
tells the owner in writing that this run fills the tool queue, and the tool
builder ships at most one tool a week from whatever it finds there. So every
run ends with **1-2 tool ideas queued** (top up to 2; skip only when 2 are
already waiting). A run that queues zero tools while the tool queue is empty
is a FAILED run, however good its guides were. Exactly two excuses are
banned outright:
- "The repo has no tools surface / conventions says tools are not wired" -
  the first tool build creates it (see step 5). Queue anyway.
- "No perfect tool keyword turned up" - that is rung 1, not a verdict:
  re-run the tool-shaped sweep wider before concluding it. A product whose
  users configure, calculate, or check ANYTHING by hand has a tool in it.
The quality bar still decides WHICH tool ideas pass - a fake widget queued
to hit the number is worse than an honest miss. If after a genuine wider
sweep nothing clears the bar, say so explicitly in the run report ("0 tools
queued - N tool candidates validated, none cleared the bar because X"), so
the miss is visible instead of silent.

**Auto mode fills the tank; semi mode fills the backlog.** Read
\`get_project\`'s \`auto_approve\`. When it is TRUE (the owner chose Auto -
hands-off publishing), reaching the weekly target is MANDATORY: **7 approved
guides, every week, so the builder ships one a day.** Do NOT stop at the two
or three that cleared the auto-approve zone and leave the rest sitting as
pending "optional" ideas - on an Auto-mode site that is a BUG the owner sees
as "why do I still have to add these myself?". The pending zone is a holding
area for the owner's judgment on SEMI projects only.

**The daily cadence and the quality bar are both non-negotiable, and rung 1
is how you satisfy both.** They only appear to conflict when the hunt is too
narrow - and closing rung 2 (below) removes the shortcut that used to paper
over a lazy hunt. The answer to a short queue is ALWAYS more candidates, never
a lower bar. A niche that looks exhausted at 20 candidates is almost never
exhausted; it has been searched from one angle. (Never promote source "manual"
or owner-rejected ideas - those still wait, both modes.) When \`auto_approve\`
is FALSE (Semi), the opposite: approve only the confident auto-approve-zone
winners and leave the rest pending for the owner - the backend coerces your
extra approvals to pending anyway, so just list them in the run report.
Tool ideas follow the same rule through their own flag,
\`auto_approve_tools\`: approve every tool idea you queue either way - on an
Auto-tools project that lands approved and books the week's build slot, on a
gated one the backend records it as pending for the owner. Both are success;
never leave a tool idea unapproved just because the gate might catch it.

Short of quota? Work down this ladder IN ORDER - each rung costs more than
the one above it, so exhaust a rung before descending:

1. **Hunt wider - this rung does the work, and it almost never runs dry.**
   The candidate floor is a rule, not advice: you may NOT conclude the niche
   is exhausted before at least **40 candidates** carry real volume/KD
   numbers in this run (batch the lookups - validation is the cheap part).
   If 7 guides are not yet queued at 40, keep going; the floor is a minimum,
   not a stopping point.

   A young site's winnable keywords are almost never the ones a head-term
   sweep surfaces. Work these seams in order - each one reliably yields
   queries that clear the authority gate because nobody has bothered to
   target them:
   - **Queries you already appear for.** \`get_site_stats\` carries real GSC
     queries where this domain already earns impressions at position 20-80.
     Proven relevant, already half-ranked, and free - mine this FIRST every
     run.
   - **Error strings and failure modes.** Verbatim messages, "X not
     working", "why does X", "X keeps <failing>". Almost always thin SERPs
     dominated by forum threads, and dead-on intent.
   - **Version and release deltas.** Anything the product's ecosystem
     shipped recently: new features, renamed flags, changed defaults,
     deprecations. Fast-moving spaces mint winnable queries every week and
     the incumbents are slow to update.
   - **Integration pairs.** "X with Y", "X + Y", "using X in Y" across every
     tool the product's audience already runs alongside it.
   - **Qualified long-tails of head terms you CANNOT win.** A head term that
     failed the authority gate is still a seed: add a use case, an audience,
     a constraint, a version, a platform ("X for solo devs", "X without Y",
     "X on Windows"). The qualified variant routinely clears the gate the
     bare term failed.
   - **Trend radar.** \`get_trend_topics\` - fresh topics have the thinnest
     SERPs on the internet, and the product scans for them precisely so this
     rung has fuel.

   Coming back short while any of these seams is unworked is a FAILED run,
   not an honest one. Name in the run report which seams you mined.
2. **Promote pending-zone survivors - CLOSED while DR < 20.** On a site
   with DR-equivalent under 20, this rung does not exist: do NOT promote
   pending-zone ideas to hit the quota, ever. A young site has no authority
   to spend on a keyword that already needed an exception, and every such
   page lands past position 50, burns a build slot, and adds a page the
   owner has to look at. Skip straight to rung 3. (The evidence this rule
   exists for: promoted-to-hit-cadence pages are reliably the worst
   performers in step 0's outcome data.)

   At DR 20+, the rung opens: ideas in the pending zone from source
   "research" - this run's or ones still sitting from earlier runs - passed
   the FULL quality bar; only the auto-approve KD line kept them out of the
   tank. \`update_suggestion(id, status="approved")\` the best of them -
   audience fit first, then lowest KD - until the target is met, prefixing
   the rationale with "AUTO-PROMOTED to keep the daily cadence". Never
   promote source "manual" ideas (the owner's own drafts await THEIR
   decision) or anything the owner rejected. On semi-automatic projects the
   backend records these approvals as pending - correct behavior; instead
   list in the run report exactly which ideas the owner should approve, in
   order.
3. **Reach into the volume band's soft edge - for dead-on ICP keywords
   only.** Candidates just OUTSIDE the band qualify WHEN the searcher is
   unmistakably the product's buyer (the audience-fit test leaves no
   doubt). Reach DOWNWARD first and by default: below the band's floor is
   where a young site's winnable queries live, and a 120-volume query owned
   at position 3 compounds. Reaching UPWARD is governed by the authority
   gate, not by this rung - see the volume band in the quality bar: a clean
   page 1 (authority 0-2) waives the ceiling outright, authority 3 allows it
   for dead-on ICP only, and 4+ is already dropped. KD zones and the
   authority gate never move. Low-volume + perfect fit beats high-volume +
   tangential - never the reverse.
4. **Mine the radar.** Trend topics already on the project's radar
   (\`get_trend_topics\`) are candidate sources too - derive guide angles
   from them and validate normally.
5. **Only now report a miss - and it should be genuinely rare.** Queue what
   passed and state it plainly: "quota missed - N of 7 guides queued; ladder
   exhausted at rung X", naming every seam mined at rung 1 and every one
   that came up empty. A miss reported with fewer than 40 validated
   candidates, or with any rung-1 seam unworked, is a failed run rather than
   an honest one - rung 1 is where misses are supposed to die.

   **The one exception is the SERP-check budget.** Spending all 25 checks
   without filling the queue is a legitimate stop, not a failed run - the
   budget exists precisely so a hard week costs a bounded amount. Report it
   as "SERP budget spent (25 checks) - N of 7 queued", list the candidates
   that passed the cheap filters but never got checked so the next run can
   start there, and do not descend further rungs to compensate.

   A repeated miss is a signal to escalate to the owner, not a new normal:
   if two consecutive runs come up short with the full ladder worked, say so
   in the report and name what would unblock it (a wider topic remit, more
   product surface to write about, backlinks lifting the DR ceiling).

The quality bar itself NEVER bends - not for the quota, not for the intent
mix, not for a keyword you like (KD zones, the authority gate, and the
best-page-1-answer test hold at every rung; rung 3's soft edge is the bar's
own written exception, not a bend). One precedence, no exceptions: **the bar
decides what may be queued; the quota decides how many; intent decides which
ones you chase and which of two passers wins.** The daily builder idling beats
filler shipping - but on a well-worked run it should never come to that:
rung 1 exists so the cadence is met with genuinely winnable keywords, and a
short queue nearly always means the hunt stopped early, not that the niche
ran out. On a DR 20+ site, a builder idling while vetted pending-zone ideas
sit unpromoted is a research failure; on a younger one those ideas stay put
and rung 1 makes up the difference.

### Output

Open with the **outcome steer from step 0** in one or two lines - what the
already-published pages show about which targeting is working on this
domain, and how it shaped this run's picks (or "no outcome data yet - first
runs"). Then two markdown tables: (a) keyword opportunities - keyword,
volume, KD, **authority count**, intent, type, angle; (b) recommended
tools/interactive pages - idea, target keyword, why it converts, status. Table (b) is never empty-by-omission: list the tool
candidates you swept even when none was queued, with the reason each was
dropped. Then a one-line summary of what was queued, the quota status
for BOTH queues, and the HONEST intent mix - never a forced one - e.g.
"queue now holds 7 approved guides and 2 tool ideas; 3 of 7 commercial, the
rest were the only keywords under the KD ceiling this week".
`;
