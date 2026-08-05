// The guide builder's opening payload: everything a build run used to spend
// its first ~15 turns collecting, assembled server-side in one response.
//
// Why this exists. A build session's cost is roughly (context carried) x
// (turns), and the old opening sequence was the worst possible shape for
// both: a dozen serial round-trips (get_project, get_suggestions, status
// update, get_pages, get_site_stats, then READING two or three published
// posts in full just to learn what their openings and headings looked like),
// each one adding its whole response to a context that is then re-sent on
// every later turn. The structural facts the agent was extracting by reading
// full articles - opening word-runs and heading skeletons
// - are exactly what similarity.ts already computes deterministically
// for the sameness gate. Computing them here costs one server round-trip and
// a few hundred tokens instead of tens of thousands.
//
// It is also MORE consistent than the agent doing it by hand: the same
// extractor that judges the draft at the gate now describes the corpus the
// draft must differ from, so "what to avoid" and "what gets flagged" can no
// longer drift apart.
//
// FAIL-OPEN, ALWAYS. Every section is independent and every one degrades on
// its own. A section that cannot be built is reported in `degraded` and the
// playbook falls back to the original per-step method for exactly that
// section. This tool can never block a build - the worst outcome it may
// produce is the run doing what it did before.
//
// NOT in the get_instructions path on purpose: this is its own tool call, so
// instruction rendering keeps its current latency and failure surface
// untouched.

import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { fetchProjectUrl } from "@/lib/url-guard";
import { getPacing } from "@/lib/pacing";
// The SAME helper get_suggestions uses to compute build order. Importing it
// rather than re-implementing the sort is the whole point: if the brief named
// a different queue head than the agent's own get_suggestions call would
// return, a build could work the wrong item. Build order is computed in JS
// (not SQL) so it keeps working on a DB predating 0014's queue_position.
import { sortQueue } from "@/lib/metrics";
import {
  extractFromHtml,
  tokenize,
  CORPUS_SIZE,
  OPENING_NGRAM,
} from "@/lib/similarity";

// How many recent guides to fingerprint. Deliberately smaller than the
// sameness gate's CORPUS_SIZE: the gate wants breadth to catch a house-wide
// template, while the agent only needs the last few to avoid rhyming with
// what just shipped, and every extra entry is tokens on every turn.
const FINGERPRINT_COUNT = 4;
// Internal-link candidates to rank and return. The playbook caps back-link
// edits at 3 files, so a handful of ranked options is all that is useful.
const LINK_CANDIDATES = 8;
// Per-page fetch ceiling. Same posture as the sameness gate: a page that will
// not load quickly simply sits this section out.
const FETCH_TIMEOUT_MS = 8000;

export type GuideFingerprint = {
  title: string;
  url: string;
  primary_keyword: string | null;
  // First ~6 words of the opening, the single strongest template tell.
  opening: string;
  // Normalized H2 skeleton with the topic stripped - the shape to differ from.
  headings: string[];
};

export type LinkCandidate = {
  url: string;
  title: string;
  primary_keyword: string | null;
  // Shared tokens between this page's keyword/title and the new guide's
  // keyword. A cheap, explainable proxy for topical closeness - the agent
  // still makes the final call, exactly as the playbook says.
  overlap: number;
};

export type BuildBrief = {
  queue_head: Record<string, unknown> | null;
  queue_depth: number;
  pacing: { note: string; build_allowed: boolean } | null;
  recent_guides: GuideFingerprint[];
  link_candidates: LinkCandidate[];
  site_stats: Record<string, unknown> | null;
  internal_linking: boolean;
  // Names the sections that could not be built, each with the fallback the
  // playbook should use. Empty means everything is present.
  degraded: string[];
};

// NOTE - deliberately no cover-hue field. The first cut of this module tried
// to recover the hue of recent covers by parsing it out of the cover URL, so
// the agent could rotate away from it without looking. Verified against the
// live site: generated covers are named `<slug>.webp` and carry no hue in the
// filename, so that could never work and the field was silently always empty
// - worse than absent, because an empty list reads as "no recent covers" and
// would quietly disable the variety check. The agent reads
// `public/blog/covers/` instead, which is a local directory listing in the
// repo it already has checked out: one cheap call, no network, always right.
export async function buildBrief(
  project: Project,
  opts: { keyword?: string } = {},
): Promise<BuildBrief> {
  const degraded: string[] = [];
  const brief: BuildBrief = {
    queue_head: null,
    queue_depth: 0,
    pacing: null,
    recent_guides: [],
    link_candidates: [],
    site_stats: null,
    internal_linking: project.internal_linking === true,
    degraded,
  };

  // Independent sections run concurrently - this is a single server round
  // trip for the agent either way, so there is no reason to serialize them.
  const [queueRes, pacingRes, pagesRes] = await Promise.allSettled([
    db()
      .from("suggestions")
      .select("*")
      .eq("project_id", project.id)
      // Updates (refresh-detect's flagged pages) ride the guide queue: same
      // builder, same daily slot, same ordering rules. build-guide's UPDATE
      // MODE branches on queue_head.type.
      .in("type", ["guide", "update"])
      .eq("status", "approved")
      .order("created_at", { ascending: true }),
    getPacing(project),
    db()
      .from("pages")
      .select("url, title, primary_keyword, created_at")
      .eq("project_id", project.id)
      .eq("type", "guide")
      .order("created_at", { ascending: false })
      .limit(CORPUS_SIZE),
  ]);

  // --- Queue head -----------------------------------------------------
  if (queueRes.status === "fulfilled" && !queueRes.value.error) {
    const raw = (queueRes.value.data ?? []) as {
      created_at: string;
      queue_position?: number | null;
    }[];
    const rows = sortQueue(raw) as unknown as Record<string, unknown>[];
    brief.queue_depth = rows.length;
    brief.queue_head = rows[0] ?? null;
    if (rows.length === 0) {
      // Not degraded - an empty approved queue is a real, meaningful state
      // (the playbook's low-tank backstop handles it). Say so plainly so the
      // agent does not mistake it for a failed lookup.
      degraded.push(
        "queue_head: the approved guide queue is EMPTY (this is a real state, not an error) - follow build-guide step 1's low-tank backstop",
      );
    }
  } else {
    degraded.push("queue_head: unavailable - call get_suggestions yourself");
  }

  // --- Pacing ---------------------------------------------------------
  if (pacingRes.status === "fulfilled") {
    const p = pacingRes.value;
    brief.pacing = { note: p.note, build_allowed: p.build_allowed };
  } else {
    // Pacing also appears in the rendered instructions, so this is belt and
    // braces rather than a real gap.
    degraded.push("pacing: unavailable - the pace gate in the instructions text still applies");
  }

  // --- Corpus fingerprints ------------------------------------
  if (pagesRes.status === "fulfilled" && !pagesRes.value.error) {
    const rows = (pagesRes.value.data ?? []) as {
      url: string;
      title: string | null;
      primary_keyword: string | null;
    }[];

    // Link candidates need no network - rank them from what the DB already
    // has, so this section survives even when every page fetch fails.
    if (brief.internal_linking) {
      const kw = new Set(tokenize(opts.keyword ?? ""));
      brief.link_candidates = rows
        .map((r) => {
          const tokens = new Set([
            ...tokenize(r.primary_keyword ?? ""),
            ...tokenize(r.title ?? ""),
          ]);
          let overlap = 0;
          for (const t of kw) if (tokens.has(t)) overlap++;
          return {
            url: r.url,
            title: r.title ?? r.url,
            primary_keyword: r.primary_keyword,
            overlap,
          };
        })
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, LINK_CANDIDATES);
    }

    const fetched = await Promise.all(
      rows.slice(0, FINGERPRINT_COUNT).map(async (r) => {
        // Same SSRF guard as check_sameness: never fetch a stored URL that is
        // not on this project's own domain - and re-check every redirect hop,
        // because this one hands the response BODY back to the agent, so an
        // off-domain 302 would be a read primitive, not just a probe.
        try {
          const res = await fetchProjectUrl(r.url, project.domain, {
            timeoutMs: FETCH_TIMEOUT_MS,
            userAgent: "DispatchSEO-build-brief",
          });
          if (!res?.ok) return null;
          const html = await res.text();
          const f = extractFromHtml(html, new Set(tokenize(r.primary_keyword ?? "")));
          return {
              title: r.title ?? r.url,
              url: r.url,
              primary_keyword: r.primary_keyword,
              opening: f.opening.slice(0, OPENING_NGRAM).join(" "),
              headings: f.headings.slice(0, 8),
          } satisfies GuideFingerprint;
        } catch {
          return null;
        }
      }),
    );

    brief.recent_guides = fetched.filter((x): x is GuideFingerprint => x != null);

    if (rows.length > 0 && brief.recent_guides.length === 0) {
      degraded.push(
        "recent_guides: published guides exist but none could be read - do the anti-rhyme check by reading the newest posts yourself",
      );
    }
  } else {
    degraded.push(
      "recent_guides + link_candidates: unavailable - read recent posts yourself and use get_pages for link targets",
    );
  }

  // --- Site stats (best effort) ----------------------------------------
  // Feeds build-guide step 5(c), "the site's OWN data as a citable stat".
  try {
    const { data, error } = await db()
      .from("gsc_stats")
      .select("clicks, impressions, date")
      .eq("project_id", project.id)
      .order("date", { ascending: false })
      .limit(28);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { clicks: number | null; impressions: number | null }[];
    if (rows.length > 0) {
      brief.site_stats = {
        window_days: rows.length,
        clicks: rows.reduce((n, r) => n + (r.clicks ?? 0), 0),
        impressions: rows.reduce((n, r) => n + (r.impressions ?? 0), 0),
      };
    }
  } catch {
    degraded.push("site_stats: unavailable - call get_site_stats / get_rankings if you want the site's own numbers");
  }

  return brief;
}
