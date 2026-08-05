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

// A FAILED run must not hold the cadence window. due() used to read only
// last_run_at, so a row that says "this build failed" was arithmetically
// identical to one that says "this build shipped" - the job went quiet for its
// whole cadence and the next attempt was a day away.
//
// That is not theoretical: on 2026-08-02 seo-daily--maxpertise failed at
// 08:53, the fix shipped at 14:20 and reached their repo, and nothing
// re-dispatched, because the failure row still owned the window until 04:53 the
// next morning. A paying customer sat on 8 approved ideas and 0 published pages
// for a full day. On a product that promises a guide a day, one transient
// failure - a GitHub blip, a cancelled runner, an npm hiccup - costs a
// publishing day.
//
// 2h is short enough to recover inside the same night and long enough that a
// genuinely broken repo retries ~10x a day rather than on every 3h dispatch
// tick. The escalating backoff below stops a permanently broken project from
// burning a runner minute every 2h forever: consecutive failures widen the
// window (2h, 4h, 8h, capped at the normal cadence), so a repo that is properly
// broken settles back to its usual once-a-day attempt and shows up as a
// standing red banner instead of a bill.
export const FAILURE_RETRY_HOURS = 2;

// A QUOTA failure is not a broken repo - it is "come back later", and the agent
// account it belongs to is the CUSTOMER's, not ours. Backing off on it is
// exactly wrong: the customer's Claude/Codex window resets on a clock (the
// message usually names it - "resets 1:50pm (UTC)"), so the right move is to
// keep checking at the short interval until it clears, not to widen to 8h and
// then 16h and lose the rest of their day.
//
// Live example this rule exists for: seo-tools--maxpertise failed twice on
// 2026-08-02 at 12:36 and 12:37 with "You've hit your session limit · resets
// 1:50pm (UTC)". With plain backoff that is 2 strikes -> a 4h window; the reset
// was 70 minutes away. Escalating would have idled a paying customer's builder
// for hours after their quota was already back.
//
// Matching on message text is deliberately narrow and is a HINT, not a verdict:
// a false negative just means normal backoff, a false positive just means we
// retry at 2h instead of 4h. Neither can lose data or double-build - the
// builders' own gates (built-today, open PR, empty queue) make an extra attempt
// a no-op.
const QUOTA_HINT = /session limit|usage limit|rate.?limit|quota|too many requests|\b429\b/i;

export function looksLikeQuotaFailure(errors: readonly string[] | null | undefined): boolean {
  return (errors ?? []).some((e) => QUOTA_HINT.test(e));
}

export function failureRetryHours(
  consecutiveFailures: number,
  cadenceHours: number,
  quota = false,
): number {
  if (quota) return Math.min(FAILURE_RETRY_HOURS, cadenceHours);
  const widened = FAILURE_RETRY_HOURS * 2 ** Math.max(0, consecutiveFailures - 1);
  return Math.min(widened, cadenceHours);
}

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

// How many times in a row each job has ended in a real FAILURE, newest-first.
// Claim rows are skipped (a hand-out is not an outcome) and the count stops at
// the first success, so a job that failed once after a healthy run scores 1 and
// gets the shortest retry window.
//
// This reads cron_runs directly rather than going through getCronHealth, which
// collapses to one row per job and so cannot see a streak. 200 rows covers the
// four scheduled jobs of one project many times over.
async function consecutiveFailures(jobKeys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (jobKeys.length === 0) return out;
  const { data, error } = await db()
    .from("cron_runs")
    .select("job, ok, claimed_only, created_at")
    .in("job", jobKeys)
    .order("created_at", { ascending: false })
    .limit(200);
  // A failed read must not widen anyone's window - callers default to 1, the
  // shortest retry, so an unreadable history errs toward trying again sooner.
  if (error || !data) return out;
  const settled = new Set<string>();
  for (const row of data) {
    const job = row.job as string;
    if (settled.has(job) || row.claimed_only) continue;
    if (row.ok) {
      settled.add(job);
      continue;
    }
    out.set(job, (out.get(job) ?? 0) + 1);
  }
  return out;
}

async function approvedCount(projectId: string, types: string[]): Promise<number> {
  const { count } = await db()
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .in("type", types)
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
// The sentence the builder writes when a project's agent has no credential
// (api/builder/jobs). It lives here because due() has to RECOGNISE it: that
// row records a job that never ran, so it must not consume a cadence window.
// Without this, pasting the missing key changed nothing visible - the job
// stayed not-due for the rest of its window (up to 20h for a build, 6.5 days
// for geo-scan), which reads as "I did what it asked and it stayed broken".
export const NO_CREDENTIAL_MARKER = "credential is available to the builder";

function isCredentialBlocked(errors: string[]): boolean {
  return errors.length > 0 && errors.every((e) => e.includes(NO_CREDENTIAL_MARKER));
}

export async function dueBuildWork(
  p: Project,
  jobKey: (wf: ScheduledWorkflow) => string,
  // Set once the credential that blocked this project has actually arrived.
  // Only then do the blocked rows stop counting - while the key is still
  // missing they keep parking the job, which is what rate-limits the alert to
  // one row per cadence instead of one per 10-minute poll.
  opts?: { credentialAvailable?: boolean },
): Promise<ScheduledWorkflow[]> {
  const flags = effectiveAutomations(p);
  const health = await getCronHealth(p.slug);
  const fails = await consecutiveFailures(SCHEDULED_WORKFLOWS.map(jobKey));

  // Due = no run row inside the cadence window, or the only row inside it is a
  // claim that outlived its grace period, meaning the runner it was handed to
  // never actually finished it, or the last real outcome was a FAILURE that has
  // now waited out its (backing-off) retry window.
  const due = (wf: ScheduledWorkflow, cadenceOverrideHours?: number) => {
    const key = jobKey(wf);
    const row = health.find((h) => h.job === key);
    if (!row) return true;
    const ageMs = Date.now() - new Date(row.last_run_at).getTime();
    if (row.claimed_only) return ageMs > CLAIM_GRACE_HOURS * 3_600_000;
    // The blocker is gone: a "no agent credential" row means this job never
    // ran, so it owes no cadence. Due immediately, not in 20 hours.
    if (opts?.credentialAvailable && !row.ok && isCredentialBlocked(row.errors)) return true;
    const cadenceHours = cadenceOverrideHours ?? CADENCE_HOURS[wf];
    // update_available rows are ok:false but INFORMATIONAL (a newer pipeline
    // pack exists) - retrying a build cannot resolve one, so they must not
    // shorten the window or every project would rebuild on every tick.
    if (!row.ok && !row.update_available) {
      const retryHours = failureRetryHours(
        fails.get(key) ?? 1,
        cadenceHours,
        looksLikeQuotaFailure(row.errors),
      );
      return ageMs > retryHours * 3_600_000;
    }
    return ageMs > cadenceHours * 3_600_000;
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
  // Updates (refresh-detect) count as buildable guide work - they ride the
  // same workflow and daily slot via build-guide's UPDATE MODE.
  if (
    flags.auto_build_guides &&
    due("build-guide") &&
    (await approvedCount(p.id, ["guide", "update"])) > 0
  ) {
    wanted.push("build-guide");
  }
  if (flags.auto_build_tools && due("build-tool") && (await approvedCount(p.id, ["tool"])) > 0) {
    wanted.push("build-tool");
  }
  if (due("geo-scan")) wanted.push("geo-scan");

  return wanted;
}
