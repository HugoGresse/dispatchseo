"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Dashboard banner - the honest progress surface for a fresh project. On
// cloud it is the ONLY surface (no setup cards); on self-host (since
// 2026-08-06) it sits above the cards so a freshly added second site never
// exits the wizard into a silent dashboard. Three phases, then it hides:
//   setup    - pipeline not installed yet. Cloud copy: installing in the
//              background. Self-host copy: waiting on the owner's install
//              command - nothing self-host runs "in the background" before
//              that. Both link to /onboarding's live install checklist.
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
  cloud = true,
}: {
  slug: string;
  repo: string | null;
  since: string | null;
  installed?: boolean;
  cloud?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(installed ? "firstRun" : "setup");
  const [researchDone, setResearchDone] = useState(false);
  const [ranksPossible, setRanksPossible] = useState(true);
  const [slow, setSlow] = useState(false);
  // The open install PR, while one exists: the single owner-blocking move of
  // the whole setup. Until this was surfaced HERE, the dashboard could look
  // finished while the pipeline sat on an unmerged branch - workflows only
  // trigger from the default branch, so nothing would ever run, and the only
  // way to learn that was to ask an agent (2026-08-06, mia-tax).
  const [openPr, setOpenPr] = useState<{ url: string; title: string } | null>(null);
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
          open_pr?: { url: string; title: string } | null;
        };
        setResearchDone((s.ideas_queued ?? 0) > 0);
        setRanksPossible(s.ranks_possible !== false);
        setOpenPr(s.open_pr ?? null);
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

  // SETUP: pipeline not installed yet - link to the live install checklist.
  // Cloud installs itself in the background; self-host waits on the owner
  // running the install command, and the copy must not pretend otherwise.
  if (phase === "setup") {
    // An open install PR outranks every other setup message: merging it is
    // the owner's ONLY move, everything else is waiting on exactly that.
    // Link straight to the PR, not /onboarding - one click from the answer.
    if (openPr) {
      return (
        <div className="border-b border-amber-500/30 bg-amber-500/[0.08] px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-neutral-200">
            <a
              href={openPr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-1 items-center gap-2.5 hover:text-white"
            >
              {spinner}
              <span>
                <b className="font-semibold text-white">Waiting on you: merge the install pull request.</b>{" "}
                Nothing can build or publish until it lands on the default branch — everything else
                is ready and starts on its own once you merge.{" "}
                <span className="whitespace-nowrap font-medium text-amber-300 underline-offset-2 group-hover:underline">
                  Open the PR →
                </span>
              </span>
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="border-b border-violet-500/25 bg-violet-500/[0.07] px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-neutral-200">
          <Link href="/onboarding" className="group flex flex-1 items-center gap-2.5 hover:text-white">
            {spinner}
            <span>
              {cloud ? (
                <>
                  <b className="font-semibold text-white">Setting up your site in the background.</b>{" "}
                  This runs on GitHub and usually takes 5–15 minutes — feel free to look around;
                  your data fills in automatically once it&apos;s done.{" "}
                </>
              ) : (
                <>
                  <b className="font-semibold text-white">This site isn&apos;t publishing yet.</b>{" "}
                  The content pipeline isn&apos;t installed — run the install command from the
                  &quot;Initial setup&quot; card on Home (or the wizard) inside your site&apos;s
                  repo; this banner follows the install live and clears itself.{" "}
                </>
              )}
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
