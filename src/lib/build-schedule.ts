import { db } from "./db";
import { getCronHealth } from "./cron-alerts";
import { effectiveAutomations, type Project } from "./projects";
import { guideQueueDry } from "./queue-refill";

// WHICH BUILD WORK IS DUE - the single answer, for both runners.
//
// DispatchSEO executes the same four scheduled jobs through two different
// runners: the self-hosted in-stack builder container (/api/builder/jobs hands
// it work) and the GitHub Actions workflows in the site's repo
// (/api/cron/seo-dispatch wakes them). Before this module the due-ness rules
// lived only in the builder feed, and the workflows carried their own copy in
// bash - three-times-a-day cron chains whose guard steps re-derived "is there
// anything to build" on a runner GitHub had already started billing for.
//
// Both paths now ask this module instead. That is the point: a cadence fix is
// one edit, and the two runners cannot answer "is this due" differently for the
// same project - which they silently could when one was TypeScript and the
// other was a shell guard reading a different set of signals.
//
// The other half of the rewrite is WHERE the answer is computed. GitHub bills a
// minimum of one whole minute for every job that claims a runner, so a workflow
// that wakes up, discovers an empty queue and exits still costs a minute; at
// three scheduled attempts a day that was ~300 wasted minutes per site per
// month, roughly a quarter of a repo's free-tier quota. The backend already
// knows the queue is empty. Deciding here and dispatching only real work means
// the runner starts only when there is something for it to do.

export type ScheduledWorkflow = "research" | "build-guide" | "build-tool" | "geo-scan";

export const SCHEDULED_WORKFLOWS: ScheduledWorkflow[] = [
  "research",
  "build-guide",
  "build-tool",
  "geo-scan",
];

// Cadence windows, in hours. Dailies use 20h (not 24) so a run that fired at
// 05:10 yesterday is already due at 05:00 today; weeklies use 6.5 days for the
// same slack. The instructions' own gates (pacing, built-today, an open PR)
// make an extra attempt a cheap no-op, never a double build.
export const CADENCE_HOURS: Record<ScheduledWorkflow, number> = {
  research: 156,
  "build-guide": 20,
  "build-tool": 20,
  "geo-scan": 156,
};

// A claim row only means "handed to a runner", not "finished" - the runner is
// expected to overwrite it with a real outcome. If nothing supersedes it within
// this window (dead container, dispatch that woke nothing, crash before
// reporting), treat the job as never having run rather than letting it sit
// "done" for the rest of its cadence window.
export const CLAIM_GRACE_HOURS = 3;

// The cron_runs job key each workflow reports under, per runner. The GitHub
// workflows report the names they have always reported (seo-daily et al,
// suffixed with the project slug by the deploy-check route); the in-stack
// builder uses its own builder-* namespace. Claim rows MUST be written under
// the same key the runner will report with, or the claim is never superseded
// and the job reads as permanently in-flight.
export function ghJobKey(wf: ScheduledWorkflow, slug: string): string {
  const name: Record<ScheduledWorkflow, string> = {
    research: "seo-weekly-research",
    "build-guide": "seo-daily",
    "build-tool": "seo-tools",
    "geo-scan": "seo-geo-scan",
  };
  return `${name[wf]}--${slug}`;
}

export function builderJobKey(wf: ScheduledWorkflow, slug: string): string {
  return `builder-${wf}--${slug}`;
}

// The repository_dispatch event each workflow listens for. seo-research and
// seo-tool-approved predate this module (first-run research and the
// approve-a-tool wake-up); seo-guide-build and seo-geo-scan are new, added so
// the two remaining scheduled workflows can be woken on demand instead of
// polling on a cron chain.
export const DISPATCH_EVENT: Record<ScheduledWorkflow, string> = {
  research: "seo-research",
  "build-guide": "seo-guide-build",
  "build-tool": "seo-tool-approved",
  "geo-scan": "seo-geo-scan",
};

async function approvedCount(projectId: string, type: "guide" | "tool"): Promise<number> {
  const { count } = await db()
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("type", type)
    .eq("status", "approved");
  return count ?? 0;
}

/**
 * The scheduled work this project is due for right now, in the order it should
 * be handed out. Empty means "nothing to do" - which for the GitHub path means
 * "do not wake a runner", and is the whole saving.
 *
 * `jobKey` maps a workflow to the cron_runs key its runner reports under, so
 * the same due-ness math serves both runners without either knowing about the
 * other's naming.
 */
export async function dueBuildWork(
  p: Project,
  jobKey: (wf: ScheduledWorkflow) => string,
): Promise<ScheduledWorkflow[]> {
  const flags = effectiveAutomations(p);
  const health = await getCronHealth(p.slug);

  // Due = no run row inside the cadence window, or the only row inside it is a
  // claim that outlived its grace period, meaning the runner it was handed to
  // never actually finished it.
  const due = (wf: ScheduledWorkflow, cadenceOverrideHours?: number) => {
    const row = health.find((h) => h.job === jobKey(wf));
    if (!row) return true;
    const ageMs = Date.now() - new Date(row.last_run_at).getTime();
    if (row.claimed_only) return ageMs > CLAIM_GRACE_HOURS * 3_600_000;
    return ageMs > (cadenceOverrideHours ?? CADENCE_HOURS[wf]) * 3_600_000;
  };

  const wanted: ScheduledWorkflow[] = [];

  // Queue-empty self-heal, the twin of queue-refill.ts. Research on a 156h
  // cadence drains to zero by day 7, and the builders would then run finding
  // nothing - a week of "successful" runs and no published post. A dry queue
  // collapses the cadence to daily; it does NOT bypass due(), so the claim row
  // and its grace window still stop research being re-handed on every tick.
  // null (the count query failed) is never treated as dry.
  const dryQueue = (await guideQueueDry(p.id)) === true;
  if (due("research", dryQueue ? 20 : undefined)) wanted.push("research");

  // Both builders run only when there is something to build. On the GitHub path
  // this is what replaces a runner minute with a database count: an empty
  // queue used to be discovered by a guard step that had already cost a full
  // billed minute to reach.
  if (flags.auto_build_guides && due("build-guide") && (await approvedCount(p.id, "guide")) > 0) {
    wanted.push("build-guide");
  }
  if (flags.auto_build_tools && due("build-tool") && (await approvedCount(p.id, "tool")) > 0) {
    wanted.push("build-tool");
  }
  if (due("geo-scan")) wanted.push("geo-scan");

  return wanted;
}
