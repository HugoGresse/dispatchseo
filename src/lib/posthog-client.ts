import posthog from "posthog-js";

import { analyticsConfigured, readConsent } from "./analytics-consent";

// The single place browser-side PostHog is allowed to start.
//
// init() used to run at module load in instrumentation-client.ts, which meant
// autocapture and session recording began before the visitor had any say. It
// now runs from here, and only after readConsent() === "granted" - either at
// load (returning visitor who already agreed) or the moment they click Accept.
//
// Idempotent on purpose: instrumentation-client calls it on boot and the
// banner calls it again on Accept, and posthog-js does not enjoy being init'd
// twice.
let started = false;

export function startPostHog(): void {
  if (started || !analyticsConfigured()) return;
  if (readConsent() !== "granted") return;
  started = true;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN as string, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-05-30",
  });
}

// Whether it is safe to call posthog.identify()/reset(). Calling into an
// uninitialised posthog-js is not a no-op, so every call site checks first -
// otherwise declining analytics turns the logout link into a thrown error.
export function posthogReady(): boolean {
  return started;
}
