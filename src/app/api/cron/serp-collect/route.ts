import { credsForProject } from "@/lib/dataforseo";
import { abandonStalePending, collectSerpResults } from "@/lib/dataforseo-tasks";
import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { listProjectsChecked } from "@/lib/projects";

// Hourly collector for the SERP task queue (see dataforseo-tasks.ts):
// daily-ranks POSTs cheap standard-queue tasks, this cron fetches the
// finished ones and writes the rank_checks / AI-visibility rows. Runs from
// GitHub Actions (serp-collect.yml) like the other high-frequency schedules.
//
// Same isolation contract as every cron: one project failing must not kill
// the rest, and "nothing pending" is the normal case for most projects
// (GSC/SerpApi modes never queue tasks) - those stay out of the report.
// Creds are resolved with the monthly budget gate BYPASSED: retrieval never
// bills, and gating it stranded already-paid tasks the moment an owner
// crossed budget (2026-07-27 review). A project with pending tasks and NO
// resolvable creds (plan gate, decrypt failure) gets its stale tasks marked
// abandoned so the loss shows in the report instead of pending-forever.

export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;

  const { projects, degraded } = await listProjectsChecked();
  const runs = await Promise.allSettled(
    projects.map(async (project) => {
      const creds = await credsForProject(project, { skipBudgetGate: true });
      if (!creds) {
        const abandoned = await abandonStalePending(project.id);
        return abandoned > 0
          ? { skipped: "no DataForSEO creds", abandoned_no_creds: abandoned }
          : { skipped: "no DataForSEO creds" };
      }
      return collectSerpResults(project, creds);
    }),
  );

  const result: Record<string, unknown> = {};
  let hadError = false;
  if (degraded) {
    hadError = true;
    result._projects_degraded = degraded;
  }
  runs.forEach((r, i) => {
    const slug = projects[i].slug;
    if (r.status === "fulfilled") {
      const v = r.value as Record<string, unknown>;
      // Keep the report readable: most projects have nothing in flight, and
      // creds-less projects only matter once tasks were actually abandoned.
      if (v.collected === 0 && !v.errored && !v.abandoned) {
        if (!v.abandoned_no_creds) return;
      }
      if (v.skipped === "no DataForSEO creds" && !v.abandoned_no_creds) return;
      if (v.errored || v.abandoned) hadError = true;
      result[slug] = v;
    } else {
      hadError = true;
      result[slug] = { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    }
  });

  console.log("[serp-collect]", JSON.stringify(result));
  await reportCronRun("serp-collect", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
