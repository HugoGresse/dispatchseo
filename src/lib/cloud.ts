// Cloud/self-host mode split. Self-host is the default: single owner, one
// password (dashboard-auth.ts). CLOUD_MODE="true" flips the deployment to
// multi-user: Supabase Auth accounts (cloud-auth.ts), per-user project
// ownership (projects.owner_user_id, migration 0031), and billing. The flag
// is read at request time so both paths stay live in one codebase - never
// branch on it at module scope.
export function isCloudMode(): boolean {
  return process.env.CLOUD_MODE === "true";
}

// Can GitHub's runners reach this backend at all? A self-host install on a
// laptop, a homelab LAN or a Tailscale tailnet is unreachable from a hosted
// runner, so its repo workflows physically cannot phone home - their silence
// is geometry, not rotted secrets, and alerting on it is a false alarm nobody
// can clear. This used to be `APP_URL.includes("localhost")`, which answered
// wrong for every LAN and tailnet install; the install playbook has always
// defined local as "localhost / 127.x / a private address", and this is that
// definition in code.
//
// NOT the same question as "who runs the builds" - a VPS install with a public
// DOMAIN is perfectly reachable AND still builds in-stack. That one is
// inStackBuilderOwnsBuilds(); conflating the two had the backend dispatching
// GitHub research while the in-stack builder claimed the same job.
export function isLocalBackendUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // unparseable: treat as remote, the safer default for alerts
  }
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "[::1]") return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 10) return true; // loopback, RFC1918 /8
  if (a === 192 && b === 168) return true; // RFC1918 /16
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 /12
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT, incl. Tailscale
  return false;
}
