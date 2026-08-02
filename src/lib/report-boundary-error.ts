import * as Sentry from "@sentry/nextjs";

// Errors caught by an App Router error.tsx never reach Sentry on their own:
// React hands them to the boundary instead of letting them escape to the
// window handler the browser SDK listens on. So the boundaries report here.
//
// The digest check is the de-duplicator. Next attaches a `digest` to any error
// that was thrown on the SERVER and serialised down to the client boundary -
// and those were already captured by `onRequestError` (src/instrumentation.ts)
// with the full stack and request context, which is strictly better than the
// redacted "an error occurred in the Server Components render" string this
// side sees. Reporting both would file that useless string as its own issue
// next to the real one.
//
// No digest means the throw happened in the browser, where Sentry has heard
// nothing at all - that is the case worth sending.
export function reportBoundaryError(error: Error & { digest?: string }): void {
  if (error.digest) return;
  Sentry.captureException(error);
}
