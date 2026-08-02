import { db } from "./db";
import { reportCronRun } from "./cron-alerts";

// Stuck-build recovery (2026-07-20 audit, finding B3). A builder crash
// between update_suggestion(in_progress) and update_suggestion(done) -
// max-turns exhaustion, a cancelled run, an infra flake - used to strand the
// suggestion as a phantom "Building now" forever, with no dashboard action
// able to touch it and every future builder run skipping past it. This
// sweep, called from the hourly-gsc cron (the most frequent backend
// heartbeat), reverts anything stuck in_progress far past the build
// workflows' own 45-minute timeout back to approved, so the next scheduled
// builder attempt simply picks it up again.
//
// Recovery is RECORDED, not alarmed. It used to report hadError=true, which -
// once the job name carried the project slug - emailed the owner AND the
// customer to say a job "failed", about an event the sweep had already fixed
// and whose own text ends "there is nothing to do" (2026-08-02). Only repeated
// recovery for the same project goes loud; see the threshold below.

const STUCK_AFTER_HOURS = 3;

// How long a recovery notice stays on the banner before a clean sweep clears
// it. The point of the notice is "a build died, and you should know" - not "a
// build died once, forever". This job only ever wrote ok:false rows, so a
// single crashed build (max-turns, a cancelled run, a container restart mid-
// build - all routine) left Home red until the owner clicked "mark as fixed",
// even though the sweep had already re-queued the suggestion and the next
// attempt succeeded. That erodes the one property the banner has to keep: if
// there is no banner, nothing needs attention. One build cadence is long
// enough for the retry to have happened and for the owner to have seen it.
const NOTICE_CLEARS_AFTER_HOURS = 24;

export async function recoverStuckBuilds(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STUCK_AFTER_HOURS * 3600_000).toISOString();
    const { data, error } = await db()
      .from("suggestions")
      .select("id, title, project_id, started_at")
      .eq("status", "in_progress");
    if (error || !data?.length) return await clearStaleRecoveryNotice();
    // Only rows with a build-start clock are judged. A null started_at means
    // the row predates migration 0027 (or the instance hasn't applied it) -
    // there is NO safe proxy: decided_at is approval time, and a suggestion
    // can legitimately sit approved for days before FIFO reaches it, so
    // reverting on it would kill healthy builds. Those rows stay untouched
    // until a post-0027 run re-marks them with a real clock.
    const stuck = data.filter((row) => {
      const started = row.started_at as string | null;
      return started !== null && started < cutoff;
    });
    if (!stuck.length) return await clearStaleRecoveryNotice();
    for (const row of stuck) {
      const { error: revertError } = await db()
        .from("suggestions")
        .update({ status: "approved", started_at: null })
        .eq("id", row.id)
        .eq("status", "in_progress");
      if (revertError) {
        // Pre-0027 schema: retry without the clock column.
        await db()
          .from("suggestions")
          .update({ status: "approved" })
          .eq("id", row.id)
          .eq("status", "in_progress");
      }
    }
    // Report PER PROJECT, and under a key collectErrors actually harvests.
    //
    // Two bugs in one line before this. The payload used `recovered` and
    // `note`, and collectErrors only picks up `error` and `failed` - so the
    // alert email read "The build-recovery job just failed." with no detail at
    // all, which is precisely what RELIABILITY.md forbids. And the bare job
    // name is instance-wide, which getCronHealth hides from every scoped tenant
    // in cloud - so the customer whose build actually died was the one person
    // never told, while the operator got an errors array mixing every tenant's
    // suggestion titles together.
    //
    // Suffixing with the slug fixes banner, customer email and mark_cron_fixed
    // in one move: all three key off `--<slug>`.
    const byProject = new Map<string, string[]>();
    for (const row of stuck) {
      const pid = row.project_id as string;
      byProject.set(pid, [...(byProject.get(pid) ?? []), row.title as string]);
    }
    const { getProjectById } = await import("./projects");
    for (const [projectId, titles] of byProject) {
      const slug = (await getProjectById(projectId))?.slug ?? null;
      const job = slug ? `build-recovery--${slug}` : "build-recovery";
      const lines = titles.map(
        (t) =>
          `"${t}" stopped partway through building and has been put back in the queue - ` +
          `the next scheduled build retries it automatically, so there is nothing to do`,
      );
      // ONE recovery is routine and self-healing - the sweep already fixed it,
      // and the message says so in as many words. Alerting on it emails the
      // owner AND (since the job name carries the slug) the customer, to tell
      // them a thing that needs no action "failed". That is the alert-noise
      // failure mode this whole rail is supposed to prevent: an alarm nobody can
      // act on teaches people to ignore the ones they can.
      //
      // REPETITION is the real signal. A build dying once is a cancelled runner
      // or an agent that ran out of turns; the same project's builds dying
      // repeatedly inside a day means something is actually broken and no amount
      // of re-queueing will fix it. So the row is always written - the audit
      // trail matters - but it only goes loud on the third recovery in 24h.
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await db()
        .from("cron_runs")
        .select("id", { count: "exact", head: true })
        .eq("job", job)
        .eq("ok", false)
        .gte("created_at", since);
      const repeated = (count ?? 0) >= 2; // this one would be the 3rd
      await reportCronRun(
        job,
        repeated
          ? {
              failed: [
                ...lines,
                `this is the ${(count ?? 0) + 1}th build recovery for this site in 24h - ` +
                  `re-queueing is no longer fixing it, so the builds are failing for a real reason`,
              ],
            }
          : { note: lines.join(" | ") },
        repeated,
      );
    }
  } catch (e) {
    console.error("[build-recovery] sweep failed:", e);
  }
}

// Retire an old recovery notice once nothing is stuck any more. Deliberately
// NOT written on every clean sweep: this job runs from hourly-gsc, so an
// unconditional ok row would add thousands of rows a year to cron_runs and
// push real history out of the window other jobs read. It writes exactly once
// per notice - only when the newest row is a recovery failure old enough that
// the re-queued build has had its retry.
async function clearStaleRecoveryNotice(): Promise<void> {
  try {
    // Now that notices are written per project (build-recovery--<slug>), the
    // clear has to sweep them all. The bare name is still matched so notices
    // written before that change, and any project whose slug couldn't be
    // resolved, still age out instead of sitting red forever.
    const { data, error } = await db()
      .from("cron_runs")
      .select("job, ok, created_at")
      .like("job", "build-recovery%")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data?.length) return;
    const latestPerJob = new Map<string, { ok: boolean; created_at: string }>();
    for (const row of data) {
      const job = row.job as string;
      if (!latestPerJob.has(job)) {
        latestPerJob.set(job, { ok: Boolean(row.ok), created_at: row.created_at as string });
      }
    }
    for (const [job, row] of latestPerJob) {
      if (row.ok) continue; // already cleared
      const age = Date.now() - new Date(row.created_at).getTime();
      if (age < NOTICE_CLEARS_AFTER_HOURS * 3600_000) continue; // still worth showing
      await reportCronRun(
        job,
        { note: "no builds are stuck - the earlier recovery has been retried since" },
        false,
      );
    }
  } catch {
    // Best-effort housekeeping: never let it fail the sweep that called it.
  }
}
