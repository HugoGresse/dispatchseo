"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissChangelog } from "@/app/actions";
import { anchorFor } from "@/lib/changelog";

// The release heads-up: one quiet line under the topbar saying DispatchSEO
// itself got an update, linking straight to that release on /changelog.
// Deliberately understated - neutral, not the violet the setup banner owns,
// because this is news, not work waiting on the owner.
//
// Dismissal hides it immediately and remembers the version in a cookie (the
// dismissChangelog action), so it stays gone until the NEXT release. Following
// the link counts as dismissing too - you've seen it.

export function ChangelogBanner({ version, summary }: { version: string; summary: string }) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();

  if (hidden) return null;

  // Optimistic: the row disappears on click and the cookie write rides along
  // behind it. If the write fails the banner simply returns on the next load -
  // an unremembered dismissal is not worth an error state.
  function dismiss() {
    setHidden(true);
    start(async () => {
      try {
        await dismissChangelog(version);
      } catch {
        /* it'll ask again next load */
      }
    });
  }

  return (
    <div className="border-b border-neutral-800/80 bg-neutral-900/40 px-4 py-2 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm">
        <Link
          href={`/changelog#${anchorFor(version)}`}
          onClick={dismiss}
          className="group flex min-w-0 flex-1 items-center gap-2.5 text-neutral-400 hover:text-neutral-200"
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60"
            aria-hidden
          />
          <span className="min-w-0 truncate">
            <b className="font-medium text-neutral-200">DispatchSEO has been updated.</b>{" "}
            <span className="text-neutral-500">{summary}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap font-medium text-neutral-300 underline-offset-2 group-hover:underline">
            What&apos;s new →
          </span>
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss update notice"
          className="shrink-0 rounded p-1 text-neutral-600 transition-colors hover:text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
