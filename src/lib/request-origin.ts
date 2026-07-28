// The one rule for "what URL is this dashboard actually being visited on".
// Every surface that renders a connect command must agree, or the MCP gate's
// own recovery advice ("copy the command from Settings") hands out URLs that
// cannot connect: a plain-HTTP self-host (http://localhost:4005, a LAN IP,
// a VPS before DOMAIN= is set) must never be given https:// commands.
// Forwarded proto is trustworthy when present (Vercel, the bundled Caddy,
// and Next's standalone server all set it); the local/LAN test is the
// fallback for anything that strips it.
const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i;

export function requestOrigin(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (LOCAL_HOST.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
