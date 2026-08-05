import { db } from "./db";
import type { Project } from "./projects";
import { getDomainRatingHistory } from "./domain-rating";
import { FREE_BACKLINKS } from "./playbook-data";

// The authority read: how the site's backlink profile is doing and the one
// concrete move to make about it today. This exists because links are the half
// of SEO the pipeline cannot do for the owner - it writes and tracks pages on
// its own, but referring domains only grow when a human submits, asks, or
// earns them. The product's job is to keep that half visible and specific
// ("get listed on X, it takes 10 minutes"), never a vague "build backlinks".
//
// Same honesty rules as journey/progress/briefing: every number is a real row
// (the DataForSEO domain snapshot + its history series), unknown reads as
// null rather than 0, and the module never invents urgency - a healthy
// profile produces no nudge at all.

// The practitioner health bar for a young site: ~5 referring domains inside
// the first months is the commonly-cited "Google has a reason to trust this
// domain" floor (directories and first mentions get there; zero-link domains
// stall at the bottom of the SERPs regardless of content).
export const HEALTHY_REF_DOMAINS = 5;

export type AuthorityMove = {
  slug: string;
  name: string;
  effortMins: number;
  url: string;
};

export type Authority = {
  // Latest snapshot values; null = never measured (no DataForSEO yet).
  referring_domains: number | null;
  dr: number | null;
  // Referring domains gained across the recent history window (~5 weekly
  // snapshots). Null until two snapshots at least 2 weeks apart exist -
  // a delta needs a real yesterday before it means anything.
  gained_recent: number | null;
  // referring_domains >= HEALTHY_REF_DOMAINS; null when unmeasured.
  healthy: boolean | null;
  // The next free playbook listing not yet done/skipped - the specific move
  // the nudge points at. Null when the free list is exhausted.
  next_move: AuthorityMove | null;
  free_done: number;
  free_total: number;
};

// The one gate every surface shares (briefing action, get_next_actions):
// a link move is worth the owner's hands when the profile is measured-thin,
// or measured-flat over a real window - and only while free playbook
// listings remain. Unmeasured is never nagged.
export function needsLinkMove(a: Authority): boolean {
  if (a.referring_domains == null || !a.next_move) return false;
  if (a.referring_domains < HEALTHY_REF_DOMAINS) return true;
  return a.gained_recent != null && a.gained_recent <= 0;
}

const HISTORY_WINDOW_MS = 35 * 86_400_000;
const MIN_DELTA_SPAN_MS = 14 * 86_400_000;

export async function getAuthority(project: Project): Promise<Authority> {
  // Raw cache-row read on purpose - getDomainRating() would trigger a paid
  // DataForSEO refresh on a stale row, and an authority read must stay free.
  const [snapRes, statusRes, history] = await Promise.all([
    db()
      .from("domain_ratings")
      .select("dr, referring_domains")
      .eq("project_id", project.id)
      .maybeSingle(),
    db().from("playbook_status").select("slug, status").eq("project_id", project.id),
    getDomainRatingHistory(project.id, HISTORY_WINDOW_MS),
  ]);

  const snap = snapRes.data as { dr: number | null; referring_domains: number | null } | null;
  const referringDomains = snap?.referring_domains ?? null;

  // Delta only when the series spans enough time to be a trend rather than
  // two reads of the same week.
  let gained: number | null = null;
  const points = history.filter((h) => h.referringDomains != null);
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    const span = Date.parse(last.fetchedAt) - Date.parse(first.fetchedAt);
    if (span >= MIN_DELTA_SPAN_MS) {
      gained = (last.referringDomains as number) - (first.referringDomains as number);
    }
  }

  // A missing playbook_status table (migration pending) reads as nothing done,
  // same tolerance as the Home playbook card.
  const done = new Set(
    ((statusRes.data ?? []) as Array<{ slug: string; status: string }>)
      .filter((r) => r.status === "done" || r.status === "skipped")
      .map((r) => r.slug),
  );
  const remaining = FREE_BACKLINKS.filter((i) => !done.has(i.slug));
  const next = remaining[0] ?? null;

  return {
    referring_domains: referringDomains,
    dr: snap?.dr ?? null,
    gained_recent: gained,
    healthy: referringDomains == null ? null : referringDomains >= HEALTHY_REF_DOMAINS,
    next_move: next
      ? { slug: next.slug, name: next.name, effortMins: next.effortMins, url: next.url }
      : null,
    free_done: FREE_BACKLINKS.length - remaining.length,
    free_total: FREE_BACKLINKS.length,
  };
}
