import { effectiveAutomations, getProjectByToken, internalLinkingEnabled } from "@/lib/projects";
import { projectAgent } from "@/lib/agents";
import { planGate } from "@/lib/billing";
import { db } from "@/lib/db";
import pack from "@/lib/pipeline-pack.json";

// Whether a guide/tool build already completed today (UTC). The backend's
// scheduler decides when a build is due (api/cron/seo-dispatch); this flag is
// the workflows' own second gate, for the triggers the scheduler does not
// control - each builder's dead-man's cron, a manual workflow_dispatch, and a
// re-dispatch after a run that never reported. Tolerant: any query
// error reads as "not built" - the workflows' own PR-open guard still
// prevents double-building, so a wrong "false" costs one no-op run, while a
// wrong "true" would silently skip a day.
async function builtToday(projectId: string): Promise<{ guide: boolean; tool: boolean }> {
  try {
    const utcMidnight = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
    const { data, error } = await db()
      .from("suggestions")
      .select("type")
      .eq("project_id", projectId)
      .eq("status", "done")
      .gte("completed_at", utcMidnight);
    if (error || !data) return { guide: false, tool: false };
    return {
      guide: data.some((r) => r.type === "guide"),
      tool: data.some((r) => r.type === "tool"),
    };
  } catch {
    return { guide: false, tool: false };
  }
}

// The three weekly-cadence GitHub workflows (seo-weekly-research, seo-tools,
// seo-geo-scan) each keep one cron as a dead-man's switch behind the backend's
// dispatch, mirroring seo-daily's built_today pattern - that fallback must not
// redo work an earlier dispatch already did the same day. Tolerant like
// builtToday: any query error reads as "not run yet" so this check can never
// itself block a run.
const RETRY_GUARDED_JOBS = ["seo-weekly-research", "seo-tools", "seo-geo-scan"] as const;

async function ranToday(projectSlug: string): Promise<Record<string, boolean>> {
  const result = Object.fromEntries(RETRY_GUARDED_JOBS.map((j) => [j, false])) as Record<
    string,
    boolean
  >;
  try {
    const utcMidnight = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
    const names = RETRY_GUARDED_JOBS.flatMap((j) => [j, `${j}--${projectSlug}`]);
    const { data, error } = await db()
      .from("cron_runs")
      .select("job")
      .eq("ok", true)
      .in("job", names)
      .gte("created_at", utcMidnight);
    if (error || !data) return result;
    for (const row of data) {
      const base = RETRY_GUARDED_JOBS.find(
        (j) => row.job === j || row.job === `${j}--${projectSlug}`,
      );
      if (base) result[base] = true;
    }
    return result;
  } catch {
    return result;
  }
}

// Guides and tools waiting in the approved queue. Best-effort in the same
// direction as builtToday above: a failed count reads as "work is waiting", so
// a database blip can only ever cost one unnecessary run, never silently
// suppress a real build.
async function approvedWaiting(projectId: string): Promise<{ guide: boolean; tool: boolean }> {
  try {
    const { data, error } = await db()
      .from("suggestions")
      .select("type")
      .eq("project_id", projectId)
      .eq("status", "approved");
    if (error || !data) return { guide: true, tool: true };
    return {
      guide: data.some((r) => r.type === "guide"),
      tool: data.some((r) => r.type === "tool"),
    };
  } catch {
    return { guide: true, tool: true };
  }
}

// Everything switched off, for a project whose plan no longer covers it.
//
// This endpoint is the ONLY lever that reaches an already-installed repo. A
// lapsed account's workflows keep firing on GitHub's clock - each builder's
// dead-man's cron, the auto-merge sweep, the daily health check - and we
// cannot edit those files to stop them: pipeline-install is itself plan-gated,
// so a lapsed repo never receives another pack update. What every installed
// version DOES do, before it spends anything, is ask this endpoint what to do,
// and honour "off" by exiting in seconds without reporting a thing.
//
// So the pause is expressed in the fields the shipped workflows already read,
// not in a new one they would have to be taught: automations off (the builders
// and auto-merge stand down), built_today true and approved_waiting false (the
// dead-man's crons find nothing to do), ran_today true (the weeklies likewise).
// plan_paused is the honest name for it, carried alongside for future packs
// and for anyone reading this response by hand.
//
// Without this, an ex-customer whose coding agent still worked kept getting a
// guide built and merged every single day, free, indefinitely - the exact hole
// api/cron/seo-dispatch's own plan gate closed on the dispatch path and left
// wide open on the dead-man's path.
const PAUSED_AUTOMATIONS = {
  auto_approve: false,
  auto_approve_tools: false,
  auto_build_guides: false,
  auto_build_tools: false,
  auto_merge: false,
};

// Tiny read endpoint for the project repos' CI. Before acting, workflows ask
// which automations this project has enabled: auto-merge checks
// automations.auto_merge, the builders check auto_build_guides /
// auto_build_tools. `mode` is the display label (semi | auto | custom); the
// flags are what to obey. Bearer token is the same per-project MCP token the
// workflows already hold - the token IS the tenant, so a project can only
// ever read its own mode.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const project = token ? await getProjectByToken(token) : null;
  if (!project) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Fails OPEN, like every other plan gate: a subscription read that errors
  // must never pause a paying customer's builders. Self-host and unconfigured
  // billing answer `allowed` without a query at all.
  let planPaused = false;
  try {
    planPaused = !(await planGate(project.id)).allowed;
  } catch (e) {
    console.error(`[project-mode] plan check failed for ${project.slug}:`, e);
  }
  if (planPaused) {
    return Response.json({
      slug: project.slug,
      mode: project.mode,
      agent: projectAgent(project).id,
      plan_paused: true,
      automations: PAUSED_AUTOMATIONS,
      internal_linking: false,
      // Still served: the version check is free, and a repo that comes back
      // after the owner re-subscribes should be current rather than a pack
      // behind. It reports through the report door, which stays quiet while
      // the plan is inactive.
      pipeline_version: (pack as { version?: string }).version ?? null,
      built_today: { guide: true, tool: true },
      ran_today: Object.fromEntries(RETRY_GUARDED_JOBS.map((j) => [j, true])),
      approved_waiting: { guide: false, tool: false },
    });
  }
  return Response.json({
    plan_paused: false,
    slug: project.slug,
    mode: project.mode,
    // Which coding agent this project's builders run. Served here rather than
    // baked into the workflow files at install time, for the same reason the
    // pnpm pin is resolved at run time: an install-time edit is a decision
    // someone has to remember, and the failure mode when they don't is a
    // builder that runs the wrong agent every night. Switching agent on the
    // dashboard therefore takes effect on the next scheduled run with no repo
    // change at all. Workflows fall back to secret-presence when this field is
    // absent, so a repo installed against an older backend keeps working.
    agent: projectAgent(project).id,
    automations: effectiveAutomations(project),
    // Deliberately OUTSIDE `automations`: this is not an automation level, it
    // is permission to edit already-published pages, and the auto-merge
    // workflow reads it to decide whether a PR that MODIFIES existing content
    // may merge unattended. Kept separate so flipping a project to Auto can
    // never imply it. Absent column / older DB resolves to false.
    internal_linking: internalLinkingEnabled(project),
    // Current pipeline-pack version (content hash). Connected repos compare
    // it against their installed .dispatchseo/pipeline-version stamp in the
    // daily seo-token-check workflow and report when an update is available.
    pipeline_version: (pack as { version?: string }).version ?? null,
    built_today: await builtToday(project.id),
    ran_today: await ranToday(project.slug),
    // How much work is actually waiting. The backend's scheduler already
    // checks this before it wakes a builder (api/cron/seo-dispatch), so on the
    // normal path a runner only ever starts when there is something to build.
    // The dead-man's cron in each builder workflow has no such knowledge: left
    // to itself it starts a whole coding-agent session to discover an empty
    // queue, which is the expensive version of the no-op this change exists to
    // remove. Serving the counts lets that fallback exit in seconds instead.
    approved_waiting: await approvedWaiting(project.id),
  });
}
