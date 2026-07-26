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
export async function authCallbackUrl(): Promise<string> {
  return `${await requestOrigin()}/auth/callback`;
}
