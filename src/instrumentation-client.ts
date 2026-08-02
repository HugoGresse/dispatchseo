import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";

// Self-host installs leave the token unset - posthog-js has no way to no-op
// itself, so skip init entirely rather than call it with an empty token.
if (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-05-30",
  });
}

// Browser-side Sentry. Same skip-when-unset rule as PostHog above and as the
// server side in instrumentation.ts.
//
// Deliberately NO replayIntegration: PostHog above already records sessions,
// and running two replay recorders doubles the bytes every dashboard visitor
// uploads to buy one recording twice.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  });
}

// Names client-side navigations so a browser error carries the route it
// happened on instead of only the URL the tab was opened at.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
