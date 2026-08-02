"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REPO_URL } from "@/lib/star-prompt";

// The star ask, in the dashboard's quiet-line grammar (see PacingLine): one
// sentence of neutral-400 text with a sky link, no card, no border, no colour
// block. A framed panel with a heading would announce itself as an ad on a
// screen whose every other framed thing is the owner's own data - and this is
// the one surface in the product that asks for something instead of reporting
// something, so it gets less visual weight than the rest, not more.
//
// It renders only after a page has actually gone live (shouldAskForStar), and
// answering it - by starring or by dismissing - is final. Following the link
// counts as answering: someone who opened the repo doesn't need reminding.
//
// The dismissal fetch uses keepalive because the link navigates away in the
// same tick; see the route handler for the full reasoning.
export function StarPrompt({ livePages }: { livePages: number }) {
  const [hidden, setHidden] = useState(false);
  const router = useRouter();

  if (hidden) return null;

  function answered() {
    setHidden(true);
    void fetch("/api/star/seen", { method: "POST", keepalive: true })
      // The router cache can still hold an RSC payload with the row in it, so
      // a later back-navigation would flash it again despite the cookie.
      .then(() => router.refresh())
      .catch(() => {
        /* it'll ask again next load */
      });
  }

  return (
    <p className="flex items-center gap-2 text-sm text-neutral-400">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 shrink-0 text-neutral-600"
        aria-hidden="true"
      >
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
      </svg>
      <span className="min-w-0">
        {livePages === 1
          ? "Your first page is live."
          : `You have ${livePages} pages live.`}{" "}
        If this is working for you,{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={answered}
          className="text-sky-400 underline underline-offset-2 transition-colors hover:text-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          a star on GitHub
        </a>{" "}
        helps other people find it.
      </span>
      <button
        type="button"
        onClick={answered}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-neutral-700 transition-colors hover:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </p>
  );
}
