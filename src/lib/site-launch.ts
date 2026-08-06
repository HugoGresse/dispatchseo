import { db } from "@/lib/db";
import { gscClientForProject, type GscClient } from "@/lib/gsc";

// Detecting when a site ACTUALLY launched, instead of "the day it joined
// DispatchSEO". The launch date drives the Journey stage, the publishing
// pace and the research difficulty posture, so a wrong "today" makes an
// established site read as a newborn (and its research run gate on a
// KD ceiling it outgrew years ago).
//
// Creation already tries RDAP domain registration (domain-age.ts), but RDAP
// has no service for plenty of ccTLDs (.co.il among them - the exact case
// that surfaced this), and registration predates many launches anyway. So
// this module detects from evidence of the site being LIVE:
//   1. Search Console - the earliest date with impressions. Google only
//      serves ~16 months of history, so for older sites this is a floor
//      ("live since at least"), not the birthday.
//   2. Wayback Machine - the first archived capture of the domain. Reaches
//      back decades, no auth, one GET.
// The earlier of the two wins. Both are best-effort: a null just means "no
// evidence found", never an error - the Settings row stays the manual
// override either way.

const GSC_HISTORY_MONTHS = 16;

export type DetectedLaunch = {
  date: string; // YYYY-MM-DD
  source: "search-console" | "wayback";
  // True when the winning signal was GSC AND it sits at the very edge of
  // Google's history window - the site is older than what GSC can prove.
  at_least: boolean;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function waybackFirstCapture(domain: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&fl=timestamp&filter=statuscode:200&limit=1`,
      // 20s, not 10: a cold CDX query routinely takes >15s before archive.org's
      // caches warm up, and a timeout here silently costs the whole signal.
      { cache: "no-store", signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) return null;
    const ts = (await res.text()).trim().slice(0, 8); // YYYYMMDD
    if (!/^\d{8}$/.test(ts)) return null;
    return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  } catch {
    return null;
  }
}

async function earliestGscImpression(
  project: {
    gsc_site_url: string | null;
    gsc_oauth_refresh_token: string | null;
    owner_user_id?: string | null;
  },
  scArg?: GscClient,
): Promise<string | null> {
  if (!project.gsc_site_url) return null;
  try {
    // No afterReadinessCheck bypass here: an scArg means the caller already
    // ran the readiness gate (the cron), and without one the cloud SA-leak
    // guard inside gscClientForProject must stay in force.
    const sc = scArg ?? (await gscClientForProject(project));
    const start = new Date();
    start.setMonth(start.getMonth() - GSC_HISTORY_MONTHS);
    const res = await sc.searchanalytics.query({
      siteUrl: project.gsc_site_url,
      requestBody: {
        startDate: ymd(start),
        endDate: ymd(new Date()),
        dimensions: ["date"],
        rowLimit: 1000,
      },
    });
    let earliest: string | null = null;
    for (const r of res.data.rows ?? []) {
      const date = r.keys?.[0];
      if (!date || !(r.impressions ?? 0)) continue;
      if (!earliest || date < earliest) earliest = date;
    }
    return earliest;
  } catch {
    return null;
  }
}

export async function detectSiteLaunch(
  project: {
    domain: string;
    gsc_site_url: string | null;
    gsc_oauth_refresh_token: string | null;
    owner_user_id?: string | null;
  },
  scArg?: GscClient,
): Promise<DetectedLaunch | null> {
  const [gsc, wayback] = await Promise.all([
    earliestGscImpression(project, scArg),
    waybackFirstCapture(project.domain),
  ]);
  if (!gsc && !wayback) return null;
  const winner = !gsc || (wayback && wayback < gsc) ? wayback! : gsc;
  const source: DetectedLaunch["source"] = winner === wayback && winner !== gsc ? "wayback" : "search-console";
  // GSC earliest landing within a week of the window's far edge means the
  // history is truncated, not that the site launched then.
  const edge = new Date();
  edge.setMonth(edge.getMonth() - GSC_HISTORY_MONTHS);
  edge.setDate(edge.getDate() + 7);
  const at_least = source === "search-console" && winner <= ymd(edge);
  return { date: winner, source, at_least };
}

// Detect AND persist, when the detection is meaningfully earlier than what
// the row holds. Returns what happened so every caller (cron, Settings
// button, MCP tool) reports the same truth. Never throws.
export async function applyDetectedLaunch(
  project: {
    id: string;
    domain: string;
    site_launched_at: string | null;
    created_at: string;
    gsc_site_url: string | null;
    gsc_oauth_refresh_token: string | null;
    owner_user_id?: string | null;
  },
  scArg?: GscClient,
): Promise<{ detected: DetectedLaunch; updated: boolean } | null> {
  const detected = await detectSiteLaunch(project, scArg);
  if (!detected) return null;
  const current = project.site_launched_at ?? project.created_at;
  // Only move the date BACKWARD, and only by more than 3 days - detection
  // must never override an owner's deliberate correction with a later or
  // near-identical guess.
  const threshold = new Date(new Date(current).getTime() - 3 * 86400000);
  if (new Date(detected.date) >= threshold) return { detected, updated: false };
  const { error } = await db()
    .from("projects")
    .update({ site_launched_at: new Date(`${detected.date}T00:00:00Z`).toISOString() })
    .eq("id", project.id);
  if (error) return { detected, updated: false };
  return { detected, updated: true };
}

// The cron's guard: auto-backfill applies only while the row still holds
// its creation-time default (site_launched_at ≈ created_at) - the moment
// anything (RDAP at creation, the owner, a detection) moved it, the hourly
// path stays hands-off. The 14-day cap keeps a genuinely brand-new site
// (earliest evidence = now, nothing to move backward) from re-running the
// two lookups every hour forever.
export function launchDateLooksDefaulted(project: {
  site_launched_at: string | null;
  created_at: string;
}): boolean {
  const created = new Date(project.created_at).getTime();
  if (Date.now() - created > 14 * 86400000) return false;
  if (!project.site_launched_at) return true;
  return Math.abs(new Date(project.site_launched_at).getTime() - created) < 48 * 3600000;
}
