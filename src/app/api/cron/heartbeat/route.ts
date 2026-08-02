import { checkCron } from "@/lib/cron-auth";
import { sendHeartbeat } from "@/lib/heartbeat";

// Daily anonymous heartbeat from a self-hosted install to dispatchseo.com.
// Scheduled by the self-host cron container only (docker/cron/crontab) - the
// cloud deployment neither schedules it nor would send anything if it did
// (telemetryEnabled() is false under CLOUD_MODE, since dispatchseo.com is the
// receiver). Everything it sends, and how to turn it off, is documented at the
// top of src/lib/heartbeat.ts.
//
// Deliberately does NOT call reportCronRun(), which is the one place this repo
// breaks its own "every cron route reports" convention, so the reason is worth
// stating: reportCronRun exists to put a red banner on the owner's dashboard
// and email them. A failed heartbeat is not the owner's problem - it costs
// THIS PROJECT one data point and costs the owner nothing at all. Wiring it to
// the alerting rail would mean emailing a self-hoster because our analytics
// endpoint had a bad night, and would also earn a STALE_HOURS entry that goes
// stale for every install that opted out on purpose. Same reason there is no
// retry: see sendHeartbeat's note.
//
// Always 200, including when nothing was sent - the response body says which
// happened, so `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/heartbeat`
// is a useful way to check the opt-out actually took effect.

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;
  return Response.json(await sendHeartbeat());
}
