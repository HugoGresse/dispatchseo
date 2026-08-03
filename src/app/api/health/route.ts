import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Container health probe (Dockerfile HEALTHCHECK + docker-compose): 200 when
// the app can reach its database, 503 otherwise. Deliberately unauthenticated
// and cheap - it reveals nothing beyond up/down, and compose healthchecks
// can't carry secrets. Not used by the Vercel deployment (deploy-check covers
// that path with real self-checks).
export async function GET() {
  try {
    const { error } = await db().from("projects").select("id").limit(1);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    // The reason goes to the server log, NOT to the caller. This endpoint is
    // unauthenticated by design, and a Supabase/PostgREST error message names
    // the project ref, the host, the schema and sometimes the failing SQL -
    // free reconnaissance on a URL anyone can curl. A container healthcheck
    // only ever reads the status code, and the operator reading `docker
    // compose logs` gets the full text.
    console.error("[health] database probe failed:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 503 });
  }
}
