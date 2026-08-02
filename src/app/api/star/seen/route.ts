import { cookies } from "next/headers";
import { dashboardAuth } from "@/lib/auth-gate";
import { STAR_COOKIE } from "@/lib/star-prompt";

// "I've answered the star ask" - the only writer of that cookie.
//
// A route handler rather than a server action for the same reason
// /api/whats-new/seen is one: clicking the star link navigates away in the
// same tick, and only fetch({keepalive: true}) is guaranteed to be delivered
// through a navigation. A cancelled action would mean the row came back on the
// next load, which is exactly the nagging this is built to avoid.
//
// Purely a display preference - no tenant data is read or written, so the auth
// check is all it needs, and there is no body to validate: the cookie's value
// is never read back, only its presence.
export async function POST() {
  if (!(await dashboardAuth())) {
    return new Response(null, { status: 401 });
  }
  const jar = await cookies();
  jar.set(STAR_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365 * 5,
  });
  return new Response(null, { status: 204 });
}
