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

// Client IP for the lockout/rate-limit key. One rule for every deployment:
// the RIGHTMOST x-forwarded-for entry, which is non-forgeable on Vercel (the
// edge overwrites the header) and on the bundled Caddy (which appends). The
// "unknown" bucket (local dev, exotic proxies) shares one counter, which at
// this scale is fine. See the function body for why no other header is read.
export function clientIp(hdrs: Headers): string {
  // ONE rule, both deployment shapes: the RIGHTMOST x-forwarded-for entry.
  //
  // x-forwarded-for is append-only by convention - each proxy adds the address
  // it saw to the end - so the last entry is the one written by the hop nearest
  // us, and the only entry in the list a client cannot author. The leftmost is
  // whatever the CLIENT sent.
  //
  // On Vercel this is correct because the edge REPLACES the header: "we
  // currently overwrite the X-Forwarded-For header and do not forward external
  // IPs. This restriction is in place to prevent IP spoofing" (Vercel request-
  // headers docs). Whatever a client sends is discarded before the function
  // runs, so the value here is Vercel's own computed client IP.
  //
  // Behind the bundled Caddy (the docker `domain` profile) it is correct for
  // the opposite reason: `caddy reverse-proxy` APPENDS to an inbound value
  // rather than replacing it, so the client controls every entry except the
  // last.
  //
  // Deliberately NOT gated on process.env.VERCEL, and deliberately not reading
  // x-real-ip or x-vercel-forwarded-for:
  //  - Vercel exposes VERCEL/VERCEL_ENV only when a project setting ("Enable
  //    access to System Environment Variables") is ticked, and Vercel's current
  //    docs do not state its default. An auth control must not hinge on a flag
  //    whose value we cannot confirm - if it were off, the branch would silently
  //    take the other path in production, which is exactly the class of quiet
  //    degradation this whole sweep existed to remove.
  //  - x-real-ip is set by Vercel but NOT by Caddy, which neither sets nor
  //    strips it. Consulting it first therefore handed a self-hosted install a
  //    fully attacker-authored key: increment it per request and the
  //    5-strikes-per-15-minutes lock never trips, on a dashboard whose only door
  //    is a password. Since the rightmost XFF token is already correct on both
  //    platforms, these headers add no information and only add a forgeable
  //    path (2026-07-28).
  //
  // Behind two or more proxies (Cloudflare in front of your own nginx) this
  // keys on the nearest proxy rather than the true client, bucketing more
  // attempts together than strictly necessary. That is the safe direction to be
  // wrong in for a single-owner dashboard: it over-throttles an attacker, it
  // can never hand one unlimited guesses.
  const chain = hdrs.get("x-forwarded-for")?.split(",") ?? [];
  const last = chain[chain.length - 1]?.trim();
  return last || "unknown";
}
