import { cookies } from "next/headers";
import { dashboardAuth } from "@/lib/auth-gate";
import { CHANGELOG_COOKIE, isVersionString } from "@/lib/changelog";

// "I've seen this release" - the only writer of the what's-new cookie.
//
// This is a route handler rather than a server action ON PURPOSE. The banner
// dismisses in two ways, and one of them used to race: clicking through to the
// changelog fired the action and navigated in the same tick, so the action's
// POST could be cancelled before the cookie was written and the banner came
// back on the next load. A route handler can be called with fetch({keepalive:
// true}), which the browser is required to deliver even if the page navigates
// or closes.
//
// Purely a display preference: no tenant data is read or written, so it only
// needs the auth check, and the version is echoed from the client so it gets a
// shape check before becoming a cookie value.
export async function POST(req: Request) {
  if (!(await dashboardAuth())) {
    return new Response(null, { status: 401 });
  }
  let version = "";
  try {
    const body = (await req.json()) as { version?: unknown };
    version = typeof body.version === "string" ? body.version : "";
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!isVersionString(version)) {
    return new Response(null, { status: 400 });
  }
  const jar = await cookies();
  jar.set(CHANGELOG_COOKIE, version, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return new Response(null, { status: 204 });
}
