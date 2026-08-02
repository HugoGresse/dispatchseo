"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  analyticsConfigured,
  readConsent,
  writeConsent,
  type ConsentChoice,
} from "@/lib/analytics-consent";
import { startPostHog } from "@/lib/posthog-client";

// The consent bar for browser-side analytics. Shown once, on the first visit,
// and never again after either button is clicked.
//
// Deliberately NOT a modal and NOT a blocker: it doesn't cover the page, it
// doesn't trap focus, and the product works identically whichever button you
// press. Accept and Decline are the same size and the same weight - a Decline
// styled to be missed is a dark pattern, and under the UCPD that costs more
// than the analytics are worth.
export function AnalyticsConsentBanner() {
  // Start hidden and decide on the client. Rendering the bar server-side would
  // flash it at every returning visitor who already answered.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!analyticsConfigured()) return;
    if (readConsent() === null) setVisible(true);
  }, []);

  function choose(choice: ConsentChoice) {
    writeConsent(choice);
    setVisible(false);
    // Start immediately on Accept so this pageview is captured rather than
    // waiting for the next navigation.
    if (choice === "granted") startPostHog();
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-neutral-400">
          We&apos;d like to use analytics cookies to see how the product gets used, including
          recordings of dashboard sessions. Only if you say yes - the product works the same
          either way. Details in our{" "}
          <Link className="text-neutral-200 underline underline-offset-2" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
