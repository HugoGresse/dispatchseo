import { db } from "./db";

// Login brute-force lockout (migration 0021): 5 failed attempts from one IP
// inside 15 minutes lock that IP for 15 minutes. The count lives in Postgres
// (atomic via the record_login_failure function), so it holds across
// serverless instances. Everything is tolerant of the migration not having
// run yet - a missing table/function fails OPEN (no lockout, login still
// works), matching the projects.ts tolerance posture.

export async function loginLockedUntil(ip: string): Promise<Date | null> {
  const { data, error } = await db()
    .from("login_attempts")
    .select("locked_until")
    .eq("ip", ip)
    .maybeSingle();
  if (error || !data?.locked_until) return null;
  const until = new Date(data.locked_until as string);
  return until > new Date() ? until : null;
}

// Returns the lock expiry if this failure tripped (or extended) the lock.
export async function recordLoginFailure(ip: string): Promise<Date | null> {
  const { data, error } = await db().rpc("record_login_failure", { attempt_ip: ip });
  if (error) {
    console.error("[login-lockout] record_login_failure failed:", error.message);
    return null;
  }
  if (!data) return null;
  const until = new Date(data as string);
  return until > new Date() ? until : null;
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await db().from("login_attempts").delete().eq("ip", ip);
}

// Client IP for the lockout/rate-limit key. Order matters for spoof-resistance:
// prefer x-vercel-forwarded-for (set by Vercel's edge, never client-supplied),
// then x-real-ip (also edge-set), and only fall back to the leftmost
// x-forwarded-for token last. On Vercel all three are identical and Vercel
// OVERWRITES inbound x-forwarded-for, so the value is the real client IP either
// way - this change is a no-op for the cloud deploy. It hardens SELF-HOST:
// behind your own reverse proxy (nginx/Caddy/Docker) you MUST have that proxy
// overwrite inbound x-forwarded-for (or set x-real-ip); otherwise a client can
// spoof the leftmost token and evade the lockout. The "unknown" bucket (local
// dev, exotic proxies) shares one counter, which at this scale is fine.
export function clientIp(hdrs: Headers): string {
  // Trust the edge-set headers ONLY when we are actually behind that edge.
  // Vercel sets x-vercel-forwarded-for and x-real-ip itself and strips inbound
  // copies, so process.env.VERCEL is the precise condition under which they
  // cannot be forged. Anywhere else they are simply whatever the client typed:
  // `caddy reverse-proxy` (the bundled docker `domain` profile) adds only
  // X-Forwarded-For/Proto/Host and neither sets nor strips X-Real-IP, so a
  // self-hosted install trusted an attacker-authored value and returned from
  // this function before ever reaching the hardened rightmost-XFF logic below.
  // Incrementing X-Real-IP per request gave a fresh login_attempts row every
  // time and the 5-strikes lock never tripped - on a dashboard whose only door
  // is a password (2026-07-27; the rightmost-XFF hardening alone did not fix
  // this, because these two headers are consulted first).
  if (process.env.VERCEL) {
    const vercel = hdrs.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    if (vercel) return vercel;
    const real = hdrs.get("x-real-ip")?.trim();
    if (real) return real;
  }
  // RIGHTMOST, not leftmost. x-forwarded-for is append-only by convention: each
  // proxy tacks the address it saw onto the end, so the last entry is the one
  // written by the hop closest to us - the only entry in the list that a client
  // could not have authored. The leftmost is whatever the CLIENT sent.
  //
  // This matters for the bundled docker stack specifically: Caddy's
  // reverse_proxy APPENDS to an inbound x-forwarded-for rather than replacing
  // it, and it does not set x-real-ip at all. So on the documented `domain`
  // profile, reading leftmost handed the lockout a fully attacker-controlled
  // key - rotate the header per request and 5-strikes-per-IP never trips, on a
  // dashboard whose only door is a password the owner chose (2026-07-27).
  //
  // Behind two or more proxies (e.g. Cloudflare in front of your own nginx)
  // this keys on the nearest proxy instead of the true client, which buckets
  // more attempts together than strictly necessary. That is the safe direction
  // to be wrong in for a single-owner dashboard: it over-throttles an attacker,
  // it cannot hand one unlimited guesses.
  const chain = hdrs.get("x-forwarded-for")?.split(",") ?? [];
  const last = chain[chain.length - 1]?.trim();
  return last || "unknown";
}
