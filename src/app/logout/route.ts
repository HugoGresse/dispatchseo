import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isCloudMode } from "@/lib/cloud";
import { supabaseAuth } from "@/lib/cloud-auth";

// Sign out and land on /login. Works for both modes: Supabase session in
// CLOUD_MODE, the dash_auth cookie on self-host.
export async function GET(req: NextRequest) {
  if (isCloudMode()) {
    try {
      const supabase = await supabaseAuth();
      await supabase.auth.signOut();
    } catch {
      // Not configured / already signed out - landing on /login is enough.
    }
  }
  const jar = await cookies();
  jar.delete("dash_auth");
  // Otherwise a stale slug survives sign-out and, per active-project.ts's
  // forgiving fallback, can retarget the NEXT person who signs in on this
  // browser at whichever project this cookie last named (shared-device risk).
  jar.delete("dash_project");
  const url = req.nextUrl.clone();
  // Account deletion forwards the repos whose pipeline teardown didn't finish
  // so /login can name them. Only that one param survives the wipe - the rest
  // of the query string is never meant to outlive a sign-out.
  const leftover = req.nextUrl.searchParams.get("leftover");
  url.pathname = "/login";
  url.search = "";
  if (leftover) url.searchParams.set("leftover", leftover);
  return NextResponse.redirect(url);
}
