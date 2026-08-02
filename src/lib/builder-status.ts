import { db } from "@/lib/db";
import { instanceSettings } from "@/lib/dashboard-auth";
import { isCloudMode } from "@/lib/cloud";

// Is the in-stack builder alive and therefore the OWNER of this instance's
// build work? Anything the backend would otherwise hand to GitHub Actions -
// scheduled builds, research, geo-scan - must stand down when this is true, or
// both runners claim the same job: duplicate suggestions, duplicate
// DataForSEO spend, duplicate agent usage. They log under different cron_runs
// keys (ghJobKey vs builderJobKey), so neither suppresses the other.
//
// This is NOT "can GitHub reach us" (isLocalBackendUrl). A VPS install with a
// public DOMAIN is perfectly reachable and STILL builds in-stack; keying the
// stand-down off the URL instead of the heartbeat is what let the recommended
// VPS setup run both rails at once.
//
// The builder stamps builder_last_seen_at on every claiming poll, so a recent
// stamp means it is alive. Cloud has no in-stack builder and never checks.
const BUILDER_ALIVE_HOURS = 3;

export async function inStackBuilderOwnsBuilds(): Promise<boolean> {
  if (isCloudMode()) return false;
  try {
    const inst = (await instanceSettings()) as unknown as {
      builder_last_seen_at?: string | null;
    } | null;
    const seen = inst?.builder_last_seen_at;
    if (!seen) return false;
    return Date.now() - new Date(seen).getTime() < BUILDER_ALIVE_HOURS * 3_600_000;
  } catch {
    // Schema drift (a pre-0032 database has no heartbeat column) reads as "no
    // in-stack builder", which is the safe direction: dispatching to GitHub
    // when nothing else is building beats both runners standing down.
    return false;
  }
}

// Docker installs have two possible build paths: the in-stack builder
// (heartbeats via instance_settings.builder_last_seen_at on every claiming
// poll) and the GitHub Actions pipeline in the site's repo (reports home as
// seo-daily--<slug> / seo-tools--<slug> rows in cron_runs). "Builds are on"
// means EITHER shows recent life - the setup nag must never fire while pages
// demonstrably ship through the other path, and must survive schema drift
// (a pre-0032 database has no heartbeat column at all, which reads as
// "never checked in" no matter what the builder is doing).
//
// Recent only: a build path that has been silent this long is worth nagging
// about again - failures are the red banner's job, absence is this one's.
const EVIDENCE_WINDOW_DAYS = 14;

export async function buildsActive(): Promise<boolean> {
  const inst = (await instanceSettings()) as unknown as {
    builder_last_seen_at?: string | null;
  } | null;
  // Recency-checked, not presence-checked: this used to return true on ANY
  // stamp ever written, so one successful poll on day one latched the setup
  // nag off forever - a builder that later died for good (stopped container,
  // failed image pull on upgrade, crash loop) never brought it back.
  if (
    inst?.builder_last_seen_at &&
    Date.now() - new Date(inst.builder_last_seen_at).getTime() <
      EVIDENCE_WINDOW_DAYS * 86400000
  ) {
    return true;
  }
  // PostgREST's like patterns inside or() use * as the wildcard.
  const { data } = await db()
    .from("cron_runs")
    .select("id")
    .or("job.like.builder-*,job.like.seo-daily--*,job.like.seo-tools--*")
    .gte(
      "created_at",
      new Date(Date.now() - EVIDENCE_WINDOW_DAYS * 86400000).toISOString(),
    )
    .limit(1);
  return (data ?? []).length > 0;
}
