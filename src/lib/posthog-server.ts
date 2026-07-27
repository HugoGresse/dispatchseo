import { PostHog } from "posthog-node";

// Server-side PostHog for Next.js App Router server actions/route handlers:
// short-lived functions need flushAt/flushInterval at their minimum and an
// explicit _shutdown() per call so a queued event isn't lost when the
// function exits before the batched flush would have fired (the plain
// `shutdown()` on this SDK version is a sync, fire-and-forget compat shim -
// `_shutdown()` is the one that actually returns the flush promise). Returns
// null when no token is configured (self-host installs that haven't opted
// into their own PostHog project), so every export below silently no-ops.
function client(): PostHog | null {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return null;
  return new PostHog(token, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
}

export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = client();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
  await ph._shutdown();
}

export async function identifyServer(
  distinctId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = client();
  if (!ph) return;
  ph.identify({ distinctId, properties });
  await ph._shutdown();
}

export async function captureServerException(
  distinctId: string,
  error: unknown,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = client();
  if (!ph || !(error instanceof Error)) return;
  await ph.captureExceptionImmediate(error, distinctId, properties);
  await ph._shutdown();
}
