import { effectiveAutomations, getProjectByToken, internalLinkingEnabled } from "@/lib/projects";
import { projectAgent } from "@/lib/agents";
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
  return Response.json({
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
