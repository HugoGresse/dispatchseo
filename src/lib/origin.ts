import { headers } from "next/headers";

// The public origin of the current request, for building absolute URLs a third
// party will send the visitor back to (the OAuth dance, auth emails).
//
// Vercel terminates TLS upstream, so the scheme and host the visitor actually
// used live in x-forwarded-*, not in the request URL. Proxies may append rather
// than replace, hence taking the first value. Defaulting to https for anything
// that is not localhost matters: an http:// callback would not match Supabase's
// redirect allow-list and the link would bounce.
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const forwardedProto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = forwardedProto || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Where Supabase should return the visitor after it verifies an emailed link or
// finishes OAuth. /auth/callback is the only route that turns a credential into
// a session; anywhere else (the Site URL default is "/") renders a normal page
// and drops the code on the floor.
//
// The origin comes from the instance's CANONICAL url, never from request
// headers. This URL is emailed, and it carries a credential: a spoofed Host /
// X-Forwarded-Host would put the confirmation link - and the session it
// establishes - on an attacker's domain. That is the same reset-poisoning class
// /forgot-password already refuses to be exposed to, and there was no reason
// for the signup and resend paths to be on the other side of the line.
// requestOrigin() stays available for callbacks the browser follows within the
// same request (the Google OAuth redirect_uri), where the visitor's own origin
// is the right answer and nothing is emailed.
export async function authCallbackUrl(): Promise<string> {
  if (process.env.NODE_ENV === "development") return "http://localhost:3000/auth/callback";
  const { backendBaseUrl } = await import("./pipeline-pack");
  return `${await backendBaseUrl()}/auth/callback`;
}
