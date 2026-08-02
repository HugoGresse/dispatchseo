import * as Sentry from "@sentry/nextjs";

// Sentry error tracking for the server and edge runtimes. Same optionality
// rule as PostHog (instrumentation-client.ts, posthog-server.ts): a missing
// DSN means init is SKIPPED entirely rather than called with an empty value.
// Sentry's own docs are explicit that `enabled: false` and an undefined DSN
// still install the OpenTelemetry hooks - only not calling init is a true
// no-op, which is what a self-hosted install with no Sentry account wants.
//
// SENTRY_DSN lets the server report to a different project than the browser;
// unset, both use the one public DSN. A DSN is not a secret (it ships in the
// client bundle either way) - it only identifies where events go.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      // Every cron route, MCP tool and server action runs here. 10% of traces
      // is enough to see which route is slow without spending the free tier on
      // the hourly GSC loop, which fires 24 times a day forever.
      tracesSampleRate: 0.1,
      // Vercel sets this per environment, so preview deploys don't pollute
      // production issues.
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    });
  }
}

// Next 15+ calls this for anything thrown out of a Server Component, route
// handler or the proxy. Without it, server-side errors never reach Sentry -
// the SDK cannot wrap what the framework catches first.
export const onRequestError = Sentry.captureRequestError;
