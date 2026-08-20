import * as Sentry from "@sentry/nextjs";

// Errors caught by an App Router error.tsx never reach Sentry on their own:
// React hands them to the boundary instead of letting them escape to the
// window handler the browser SDK listens on. So the boundaries report here.
//
// The digest check drops server-thrown errors. Next attaches a `digest` to any
// error thrown on the SERVER and serialised down to the client boundary, and
// all this side ever sees of one is the redacted "an error occurred in the
// Server Components render" string - no stack, no request context, nothing you
// could act on.
//
// It used to be a de-duplicator: `onRequestError` in src/instrumentation.ts
// captured the real server-side error with its full stack, so filing the
// redacted string too would have put a useless issue next to the real one.
// That file was deleted on 2026-08-05 (428b872, "drop the server-side
// instrumentation hook"), deliberately - server errors from crons, MCP tools
// and server actions no longer report to Sentry at all. So this is no longer
// de-duplication: a server error that reaches a boundary is now reported
// NOWHERE. That is the accepted trade of that decision, not an oversight here,
// and the alternative (filing the redacted string) would spend issue noise on
// a message nobody can debug from. Server-side failures are covered instead by
// the cron_runs -> dashboard banner -> email rails, which carry the real error
// text; anything that must be noticed belongs on those rails, not on Sentry.
//
// No digest means the throw happened in the browser, where Sentry has heard
// nothing at all - that is the case worth sending.
export function reportBoundaryError(error: Error & { digest?: string }): void {
  if (error.digest) return;
  Sentry.captureException(error);
}
