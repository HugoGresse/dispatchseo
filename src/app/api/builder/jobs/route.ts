import { checkCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { reportCronRun } from "@/lib/cron-alerts";
import { credsForProject } from "@/lib/dataforseo";
import { mergeToken, builderClaudeToken, builderAgentToken, builderAgentTokens } from "@/lib/github";
import { listProjects, fetchProjectToken, effectiveAutomations } from "@/lib/projects";
import { projectAgent, type AgentId } from "@/lib/agents";
import { isCloudMode } from "@/lib/cloud";
import { dueBuildWork, builderJobKey } from "@/lib/build-schedule";

export const dynamic = "force-dynamic";

// The self-hosted builder's work feed. The Docker stack's `builder`
// container polls this with CRON_SECRET every few minutes and executes
// whatever comes back with headless Claude Code - the in-stack replacement
// for the GitHub-Actions schedules, which cannot phone home to a localhost
// backend. The SPLIT is deliberate: this route owns all scheduling brains
// (cadence, automation flags, readiness, claim-marking), the container is a
// dumb executor - so cadence fixes ship as backend deploys, never as
// "rebuild your builder image".
//
// Due-ness reads the same cron_runs log everything else uses: a job is due
// when its `builder-<wf>--<slug>` key hasn't logged a run inside its
// cadence window. Handing a job out logs a claim row (so the next poll
// doesn't hand it out again); the container then reports the real outcome
// through /api/cron/deploy-check under the same key, landing on the normal
// banner + email rails.

// Prompts mirror the pipeline-pack workflows verbatim - the agent behavior
// must not depend on which runner (GitHub or in-stack) executes it. The
// instructions themselves come from get_instructions at run time either way.
const PROMPTS: Record<string, string> = {
  research:
    "FIRST call the seo-manager MCP tool get_instructions with workflow research, then follow the returned markdown exactly - it is the current playbook and overrides any cached knowledge of this pipeline. Also read .dispatchseo/conventions.md for this repo's product-surface files. Cover the whole product (no topic filter). In brief: derive keyword candidates from product knowledge, validate them via the dataforseo MCP (or the free path the instructions describe when it is not connected), track winners via track_keywords, queue suggestions with propose_suggestion, then approve every queued idea - guides AND tools - via update_suggestion. Every run must leave 1-2 TOOL ideas in the queue alongside the guides (top up to 2; skip only if 2 are already waiting) - a run that queues zero tools while the tool queue is empty has failed, and a repo with no tools page yet is not an excuse: the first tool build creates it. (On semi-automatic projects the backend records agent approvals as pending for the owner to decide; the tool response says so and that counts as success, do not retry.) Honor the weekly quota, report the quota status and the instructions version, and output the two summary tables at the end. If get_instructions is unavailable, fail loudly and exit without changes.",
  "build-guide":
    "FIRST call the seo-manager MCP tool get_instructions with workflow build-guide, then follow the returned markdown exactly - it is the current playbook and overrides any cached knowledge of this pipeline. Also read .dispatchseo/conventions.md for this repo's site facts. In brief: take the oldest approved guide suggestion, mark it in_progress, build the guide MDX through the full pipeline (template, thin-content gate, draft, mandatory visuals, humanizer), run the repo's build to verify, open a PR labeled seo via gh, then update_suggestion to done with the PR url and log_page, and state the instructions version in the run report. Never build tool suggestions - those belong to the build-tool workflow. If get_instructions is unavailable, fail loudly and exit without changes; if there are no approved guide suggestions, exit cleanly without any changes.",
  "build-tool":
    "FIRST call the seo-manager MCP tool get_instructions with workflow build-tool, then follow the returned markdown exactly - it is the current playbook and overrides any cached knowledge of this pipeline. Also read .dispatchseo/conventions.md for this repo's site facts (registry wiring, reference implementation, theme tokens). In brief: take the oldest approved tool suggestion, mark it in_progress, run the SURFACE CHECK (if the site has no public tools home yet, scaffold registry + index + page template inside this same PR and update the conventions file - never exit for a missing tools section), read the reference implementation completely where one exists, pass the live SERP gate, run the THEME step, write the mandatory EXECUTION PLAN and hold it against the VALUE BAR - a re-skinned template or canned-output widget is a failure, redesign or set the suggestion back to pending. Then build, humanize all registry copy, run the repo's build to verify plus the funnel composition check, open a PR labeled seo and seo-tool via gh with the execution plan in the body, then update_suggestion to done with the PR url and log_page, and state the instructions version in the run report. Never build guide suggestions - those belong to the build-guide workflow. If get_instructions is unavailable, fail loudly and exit without changes; if there are no approved tool suggestions, exit cleanly without any changes.",
  "geo-scan":
    "FIRST call the seo-manager MCP tool get_instructions with workflow geo-scan, then follow the returned markdown exactly - it is the current playbook and overrides any cached knowledge of this pipeline. In brief: build ~15 customer questions from the tracked keywords and conventions, answer each with REAL web search (never from memory), judge whether the site is among the cited sources, record every result via record_ai_citations with verbatim answer excerpts, then read get_ai_visibility and report the citation counts and gap domains. If get_instructions is unavailable, fail loudly and exit without changes.",
};

// Cadence windows, in hours. Dailies use 20h (not 24) so a run that fired
// at 05:10 yesterday is already due at 05:00 today; weeklies use 6.5 days
// for the same slack. The instructions' own gates (pacing, built-today,
// empty queue) make an extra attempt a cheap no-op, never a double build.
//
// Cadence, claim-grace and the due-ness math itself now live in
// build-schedule.ts, shared with /api/cron/seo-dispatch (the same four jobs,
// executed through GitHub Actions instead of this container). They were
// duplicated for exactly as long as there was one runner; the moment a second
// one appeared, two copies of "is this due" would have been free to drift
// apart per project - the kind of split that shows up as a site that builds
// twice, or never.

export async function GET(req: Request): Promise<Response> {
  // Self-host only. This feeds the docker in-stack builder; cloud schedules run
  // through GitHub Actions instead. Refusing in CLOUD_MODE keeps every tenant's
  // MCP token + DataForSEO creds (below) off an endpoint the cloud never needs -
  // defense in depth even though nothing in cloud calls it today.
  if (isCloudMode()) return Response.json({ error: "not found" }, { status: 404 });
  const denied = await checkCron(req);
  if (denied) return denied;
  // Claiming is opt-in: only the builder's poll loop sends ?claim=1. A bare
  // GET is a free dry-run for diagnostics - the first live test lost its
  // whole night because a handoff checklist's curl silently claimed every
  // due job. Listing must never cost a cadence window.
  const claim = new URL(req.url).searchParams.get("claim") === "1";

  // Heartbeat: the wizard finale and Home's "turn on automatic builds"
  // card key "builder connected" off this stamp, so it only moves on real
  // builder polls (claim=1), never on diagnostic GETs. Tolerant: pre-0032
  // databases just no-op the update.
  if (claim) {
    await db()
      .from("instance_settings")
      .update({ builder_last_seen_at: new Date().toISOString() })
      .not("id", "is", null);
  }

  // Which agents the polling container can actually execute. The container
  // knows things this route cannot - chiefly whether its own .env carries a
  // credential - so it declares them rather than being guessed at.
  //
  // This matters because handing out a job COSTS a cadence window: the claim
  // row makes the next poll skip it for CLAIM_GRACE_HOURS. A job claimed for an
  // agent the container has no key for is a build that silently does not
  // happen. So the filter belongs here, where the claim is written.
  //
  // Absent param = an older container, which only ever ran Claude and predates
  // any project being able to choose otherwise. Reading that as "claude only"
  // is both the truthful interpretation and the safe one: a Codex project on an
  // un-upgraded stack idles visibly instead of being claimed and dropped.
  const declared = new URL(req.url).searchParams.get("agents");
  const runnable = new Set<string>(
    declared ? declared.split(",").map((a) => a.trim()).filter(Boolean) : ["claude"],
  );

  type Job = {
    key: string;
    workflow: string;
    slug: string;
    repo: string;
    mcp_token: string;
    prompt: string;
    dataforseo: { login: string; password: string } | null;
    /** Which coding agent runs this job - from the project, not the instance. */
    agent: AgentId;
    /** The credential for THAT agent. The container never picks one. */
    agent_token: string | null;
  };
  const jobs: Job[] = [];
  const mergeSweeps: Array<{ slug: string; repo: string; mcp_token: string }> = [];

  const projects = await listProjects();
  // Per-project work is ISOLATED, like every cron route (CLAUDE.md's rule). This
  // loop used to be a plain `for...of` with ~5 awaits per project and no
  // guard - the only tenant loop in the repo without one. A single throw
  // anywhere inside it (a token decrypt failure, one bad creds row, a
  // getCronHealth hiccup) 500'd the whole route, so the builder's poll came back
  // empty and NO project got a job that tick. If the cause persisted, every
  // build on the instance stopped - and this route never calls reportCronRun, so
  // nothing announced it; the builder heartbeat only notices after 30h.
  const perProject = await Promise.allSettled(
    projects.map(async (p) => {
      const out = {
        jobs: [] as Job[],
        mergeSweep: null as { slug: string; repo: string; mcp_token: string } | null,
      };
      // Builder only serves installed pipelines - mid-wizard projects wait,
      // exactly like the crons' setup gates.
      if (!p.github_repo || !p.pipeline_installed_at) return out;
      const token = await fetchProjectToken(p.id);
      if (!token) return out;
    const flags = effectiveAutomations(p);

    // Auto-merge publishing: the container sweeps green seo-labeled guide PRs
    // every tick (cheap gh calls, no agent session), replacing
    // seo-auto-merge.yml's green-checks gate for instances GitHub cannot call
    // back into.
    //
    // Set BEFORE the agent gates below, and that ordering is the point: merging
    // an already-built PR needs no coding agent at all. After them, an owner who
    // switched to Codex and had not pasted the key yet would find their
    // finished, green, ready-to-merge PR sitting there indefinitely - work
    // already paid for, stranded by a credential it never needed.
    if (flags.auto_merge) {
      out.mergeSweep = { slug: p.slug, repo: p.github_repo, mcp_token: token };
    }

    // From here on it is BUILD work, which does need an agent. The project's
    // agent decides which credential is resolved, which MCP config the container
    // writes, and which binary it runs. Resolving here rather than in the
    // container is what keeps a mixed stack honest - one site on Claude and one
    // on Codex both get served, and neither is handed the other's key.
    const agent = projectAgent(p).id;
    if (!runnable.has(agent)) return out;
    const agentToken = await builderAgentToken(agent);
    // No credential for this project's agent: leave the work unclaimed so it is
    // waiting the moment a key is pasted, instead of burning a cadence window on
    // a run that cannot start. Deliberately quiet - an instance mid-setup has no
    // key yet, and that is a normal state, not a regression (CLAUDE.md's
    // setup-gate rule).
    if (!agentToken) return out;

    // Defense in depth: this route feeds the self-hosted docker builder, which
    // must never carry the cloud platform's bundled DataForSEO credentials -
    // strip them even if a hybrid setup somehow got this far.
    const dfsCreds = await credsForProject(p);
    const jobDataforseo = dfsCreds?.billedTo === "platform" ? null : dfsCreds;

    // Due-ness, cadence collapse on a dry queue, and the approved-count gates
    // all live in build-schedule.ts now - see the header note above.
    const wanted = await dueBuildWork(p, (wf) => builderJobKey(wf, p.slug));

    for (const wf of wanted) {
      const key = builderJobKey(wf, p.slug);
      // Claim: log the hand-out so the next poll skips it (for the claim grace
      // window - see build-schedule.ts). The container overwrites this with the
      // real outcome via deploy-check reporting, which defaults claimedOnly to
      // false.
      if (claim) await reportCronRun(key, { claimed: "builder", handed_out: true }, false, true);
      out.jobs.push({
        key,
        workflow: wf,
        slug: p.slug,
        repo: p.github_repo,
        mcp_token: token,
        prompt: PROMPTS[wf],
        dataforseo: jobDataforseo,
        agent,
        agent_token: agentToken,
      });
    }

      return out;
    }),
  );

  // Serve everything that resolved; a project that threw is skipped for this
  // tick and logged, never allowed to starve the others.
  perProject.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobs.push(...r.value.jobs);
      if (r.value.mergeSweep) mergeSweeps.push(r.value.mergeSweep);
    } else {
      console.error(`builder/jobs: skipped project ${projects[i]?.slug}:`, r.reason);
    }
  });

  // The wizard's one-tap-merge token (repo scope) doubles as the builder's
  // git identity - clone, push, PR, merge. Served from here so the owner
  // never configures GitHub twice; a BUILDER_GH_TOKEN env on the container
  // overrides it.
  return Response.json({
    poll_seconds: 600,
    gh_token: (await mergeToken()) ?? null,
    // The wizard-stored Claude token (0037), so the builder needs no .env
    // edit. The container's own CLAUDE_CODE_OAUTH_TOKEN env still wins in
    // run.sh; this is the fallback it reaches for when that env is unset.
    // Always sent (claim or not) so the token resolves before any job runs.
    // Kept alongside agent_tokens below rather than replaced by it: a container
    // running an image from before this change reads this field and nothing
    // else, and self-hosters upgrade their stack when they get round to it. A
    // rename here would strand every one of them on a builder that suddenly has
    // no token.
    claude_token: (await builderClaudeToken()) ?? null,
    // Every agent this instance holds a key for. The container uses this to
    // decide what to DECLARE on its next claiming poll (?agents=), which closes
    // the loop: it only claims work it can run.
    agent_tokens: await builderAgentTokens(),
    jobs,
    merge_sweeps: mergeSweeps,
  });
}
