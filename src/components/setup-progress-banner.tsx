"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Cloud-only dashboard banner - the single honest progress surface for a fresh
// project (cloud has no self-host "Initial setup" cards; the whole story lives
// here). Three phases, then it hides:
//   setup    - pipeline still installing (pipeline_installed false). Links to
//              /onboarding, where the live install checklist runs.
//   firstRun - pipeline installed; the first automations (research -> rank
//              checks) are still landing. Message names what's actually running
//              (research vs ranking checks) and does NOT link - setup is done,
//              so /onboarding would just say "done" and confuse.
//   done     - the first ranking check exists (or, on a free/GSC-only project
//              that will never get one, the first ideas are queued) -> unmount
//              + router.refresh so the now-populated dashboard renders. (GSC's
//              traffic graph fills over the next 2-3 days on Google's own lag
//              - not gated here.)

const SLOW_AFTER_MS = 20 * 60_000; // "usually 5-15 min" - nudge past 20

type Phase = "setup" | "firstRun" | "done";

export function SetupProgressBanner({
  slug,
  repo,
  since,
  installed = false,
}: {
  slug: string;
  repo: string | null;
  since: string | null;
  installed?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(installed ? "firstRun" : "setup");
  const [researchDone, setResearchDone] = useState(false);
  const [ranksPossible, setRanksPossible] = useState(true);
  const [slow, setSlow] = useState(false);
  const refreshed = useRef(false);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/onboarding/status?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const s = (await res.json()) as {
          pipeline_installed?: boolean;
          ideas_queued?: number;
          rank_checks?: number;
          ranks_possible?: boolean;
        };
        setResearchDone((s.ideas_queued ?? 0) > 0);
        setRanksPossible(s.ranks_possible !== false);
        // Evidence outranks stamps. A rank check EXISTS only if the pipeline
        // has really run, so it settles the question on its own - checked
        // first, before pipeline_installed, because that stamp can be null on
        // a site that has been publishing for months: projects installed
        // before mark_pipeline_installed existed never got one, and nothing
        // backfills it. The layout's 24h fallback clock was supposed to cover
        // them, but it keys off github_app_installed_at, which any App
        // reconnect resets - so every reconnect re-armed "Setting up your site
        // in the background" on a live site (2026-07-29, clockedcode: 17
        // published guides, null stamp, banner back for 24h). Ordering this
        // branch first means a site with real data can never be described as
        // still setting up, whatever the timestamps say.
        // Rank tracking is the paid half. A free/GSC-only project
        // (ranks_possible false; missing means an older backend, assume
        // ranks are coming) has no rank_checks row coming, ever - waiting
        // on one kept this banner up forever while promising "rankings are
        // being pulled in now" (2026-08-06, usagecut). For those projects
        // research landing IS the finish line, same settled rule as
        // first-run-background.tsx.
        if ((s.rank_checks ?? 0) > 0 || (s.ranks_possible === false && (s.ideas_queued ?? 0) > 0)) {
          setPhase("done");
          if (!refreshed.current) {
            refreshed.current = true;
            setTimeout(() => router.refresh(), 1600);
          }
        } else if (!s.pipeline_installed) {
          setPhase("setup");
        } else {
          setPhase("firstRun");
        }
      } catch {
        /* transient - next tick retries */
      }
    }
    void poll();
    const id = setInterval(poll, 8000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [slug, router]);

  // Soft nudge off a STABLE server timestamp (survives navigation): if it's been
  // going well past the usual window, point the owner at the run itself.
  useEffect(() => {
    if (!since) return;
    const elapsed = Date.now() - new Date(since).getTime();
    if (elapsed >= SLOW_AFTER_MS) {
      setSlow(true);
      return;
    }
    const id = setTimeout(() => setSlow(true), SLOW_AFTER_MS - elapsed);
    return () => clearTimeout(id);
  }, [since]);

  if (phase === "done") return null;

  const spinner = (
    <span
      className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-violet-400/40 border-t-violet-300"
      aria-hidden
    />
  );
  const slowNudge = slow ? (
    <span className="text-amber-200/90">
      Taking longer than usual —{" "}
      {repo ? (
        <a
          href={`https://github.com/${repo}/actions`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-amber-100"
        >
          check the run in your repo&apos;s Actions
        </a>
      ) : (
        "check the run in your repo's Actions tab"
      )}
      .
    </span>
  ) : null;

  // SETUP: pipeline still installing - link to the live install checklist.
  if (phase === "setup") {
    return (
      <div className="border-b border-violet-500/25 bg-violet-500/[0.07] px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-neutral-200">
          <Link href="/onboarding" className="group flex flex-1 items-center gap-2.5 hover:text-white">
            {spinner}
            <span>
              <b className="font-semibold text-white">Setting up your site in the background.</b>{" "}
              This runs on GitHub and usually takes 5–15 minutes — feel free to look around; your
              data fills in automatically once it&apos;s done.{" "}
              <span className="whitespace-nowrap font-medium text-violet-300 underline-offset-2 group-hover:underline">
                See what&apos;s happening →
              </span>
            </span>
          </Link>
          {slowNudge}
        </div>
      </div>
    );
  }

  // FIRST RUN: setup is done; the first automations are landing. No link -
  // /onboarding would just say "done". Name what's actually running.
  return (
    <div className="border-b border-violet-500/25 bg-violet-500/[0.07] px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-neutral-200">
        <div className="flex flex-1 items-center gap-2.5">
          {spinner}
          <span>
            {researchDone ? (
              <>
                <b className="font-semibold text-white">Running your first ranking checks.</b> Setup
                is done — your rankings and search traffic are being pulled in now. The dashboard
                fills in on its own; nothing for you to do.
              </>
            ) : (
              <>
                <b className="font-semibold text-white">Researching your first keywords.</b> Setup is
                done — your first content ideas land in the queue shortly
                {ranksPossible ? ", then rankings follow" : ""}. Nothing for you to do.
              </>
            )}
          </span>
        </div>
        {slowNudge}
      </div>
    </div>
  );
}
