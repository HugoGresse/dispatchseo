// Keeps per-project MCP tokens out of Sentry.
//
// The MCP route accepts its bearer as `?key=<token>` in the URL - a deliberate
// tradeoff (see the comment on authed() in api/[transport]/route.ts) forced by
// anthropics/claude-code#50464, where Claude Code on Windows stores an
// Authorization header, reports "Connected", and then sends no header at all.
// That tradeoff was written down with ONE invariant attached: "this route must
// never log req.url."
//
// Sentry breaks it from outside the route. `Sentry.captureRequestError` (wired
// as onRequestError) attaches the request URL to every server-side error event,
// and tracesSampleRate attaches http.url / http.target to sampled transactions.
// So any 500 or any 1-in-10 sampled request on /api/mcp?key=... ships a live
// tenant credential to a third-party service - and on cloud those are OTHER
// PEOPLE'S tokens, sitting in the operator's issue tracker forever, readable by
// anyone with Sentry access and exposed by any Sentry-side breach. The token is
// the whole tenant: it reads and writes that project's queue, keywords, pages,
// GSC stats and settings.
//
// These hooks redact the value everywhere a URL can ride an event, so the
// stated invariant holds against the framework rather than against a promise.
// Redaction, not dropping: knowing WHICH route failed is the point of the
// error, and `key=[redacted]` keeps that while spending nothing.

const SENSITIVE_PARAMS = ["key", "token", "access_token", "code", "state", "secret"];

/** Replace the value of every sensitive query param in a URL-ish string. */
export function scrubUrl(value: string): string {
  let out = value;
  for (const param of SENSITIVE_PARAMS) {
    out = out.replace(
      new RegExp(`([?&]${param}=)[^&#\\s]+`, "gi"),
      `$1[redacted]`,
    );
  }
  return out;
}

/**
 * Sentry `beforeSend` / `beforeSendTransaction`. One function for both: an
 * error event and a transaction carry the URL in the same places.
 *
 * Typed on the SHAPE it touches rather than on Sentry's ErrorEvent /
 * TransactionEvent, which are structurally different and neither of which is
 * assignable to the other. Mutating in place and returning the same object is
 * the contract both hooks expect.
 */
export function scrubSentryEvent<T>(event: T): T {
  const e = event as {
    request?: { url?: unknown; query_string?: unknown };
    contexts?: { trace?: { data?: Record<string, unknown> } };
    transaction?: unknown;
  };
  if (typeof e.request?.url === "string") {
    e.request.url = scrubUrl(e.request.url);
  }
  if (typeof e.request?.query_string === "string") {
    e.request.query_string = scrubUrl(e.request.query_string);
  }
  // Transaction NAMES are route-shaped ("GET /api/[transport]") on the happy
  // path, but a raw URL lands here whenever the framework cannot resolve a
  // parameterized route - which is exactly the failure case that matters.
  if (typeof e.transaction === "string") {
    e.transaction = scrubUrl(e.transaction);
  }
  const data = e.contexts?.trace?.data;
  if (data) {
    for (const attr of ["url", "http.url", "http.target", "server.address"]) {
      if (typeof data[attr] === "string") data[attr] = scrubUrl(data[attr] as string);
    }
  }
  return event;
}
