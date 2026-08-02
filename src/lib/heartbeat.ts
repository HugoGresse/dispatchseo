import { randomUUID } from "node:crypto";
import { bustInstanceCache, instanceSettings } from "./dashboard-auth";
import { LATEST } from "./changelog";
import { db } from "./db";

// The self-host heartbeat: once a day, a self-hosted install tells
// dispatchseo.com that it is still running. It is how the project counts
// installs at all - clone counts and container pulls measure download
// ATTEMPTS, and one person re-running `sh start.sh` looks exactly like ten
// people installing for the first time. This is the only thing that
// distinguishes them.
//
// WHAT IT SENDS, in full - two fields, and this list is the contract:
//   install_id  a random UUID (see migration 0049), generated locally,
//               not derived from anything about the owner or their sites
//   version     the release this install is running, e.g. "1.4.0"
//
// What it deliberately does NOT send: no domain, no URL, no email, no site or
// keyword data, no counts of projects or pages, no IP beyond the one any HTTP
// request necessarily reveals, no token of any kind. If a future change wants
// a third field, it needs a matching line in /privacy and in
// docs/SELF_HOSTING.md before it ships - a telemetry payload that grows
// quietly is how open-source projects earn a "this thing phones home" thread.
//
// Switching it off is one line in .env: DISPATCHSEO_TELEMETRY=off. Nothing
// about the product changes when it is off; there is no nag, no degraded
// mode, and the sender returns before it reads the install id at all.

const ENDPOINT = "https://dispatchseo.com/api/heartbeat";

export type HeartbeatPayload = { install_id: string; version: string };

// UUID v4, the only shape installId() ever produces. The receiver validates
// against this too - the endpoint is public by necessity (a shared secret
// baked into a public image is not a secret), so shape validation is the one
// cheap guard that keeps a stray curl from writing arbitrary strings into the
// analytics project.
export const INSTALL_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Off when the owner says off, and off on the cloud deployment - dispatchseo.com
// is the RECEIVER; counting it as a self-hosted install would put a permanent
// +1 on every number this exists to produce. Any value but a clear "off" reads
// as on, so a typo can't silently disable it for someone who wanted it.
export function telemetryEnabled(): boolean {
  if (process.env.CLOUD_MODE === "true") return false;
  const v = (process.env.DISPATCHSEO_TELEMETRY ?? "").trim().toLowerCase();
  return v !== "off" && v !== "0" && v !== "false" && v !== "no";
}

// Resolution order mirrors every other instance-level value in this codebase
// (env -> instance_settings -> generate and persist):
//
//  1. DISPATCH_INSTALL_ID env - the docker path. start.sh writes one into
//     .env on first boot, which is the only source that works for a stack
//     whose owner never ran the setup wizard (no instance_settings row exists
//     to store anything in).
//  2. instance_settings.install_id - claimed installs, including Vercel
//     self-hosts that have no .env to write to.
//  3. Generate one and store it, healing installs claimed before 0049.
//
// Returns null when all three fail (migration not applied, no row, no env).
// The caller sends nothing in that case: an install that cannot produce a
// STABLE id must not send a fresh random one every day, or one machine would
// report as 365 installs a year.
async function installId(): Promise<string | null> {
  const env = process.env.DISPATCH_INSTALL_ID?.trim();
  if (env && INSTALL_ID_RE.test(env)) return env;

  const settings = await instanceSettings();
  if (!settings) return null;
  const stored = settings.install_id?.trim();
  if (stored && INSTALL_ID_RE.test(stored)) return stored;

  const generated = randomUUID();
  const { error } = await db()
    .from("instance_settings")
    .update({ install_id: generated })
    .is("install_id", null)
    .select("install_id")
    .maybeSingle();
  if (error) return null;
  bustInstanceCache();
  // Re-read rather than trust our own value: a concurrent writer may have won
  // the .is("install_id", null) race, and theirs is the canonical id now.
  // Trusting ours would report the same machine under two ids.
  const fresh = (await instanceSettings())?.install_id?.trim();
  return fresh && INSTALL_ID_RE.test(fresh) ? fresh : null;
}

export type HeartbeatResult =
  | { sent: true; version: string }
  | { sent: false; reason: string };

// Never throws and never retries. A heartbeat is the least important thing
// this process does: if dispatchseo.com is down, if the box has no outbound
// network, if a corporate proxy eats it - the install carries on and the count
// is short by one that day. Telemetry that can fail a cron, log an error the
// owner has to read, or hold a request open for 30s has its priorities
// backwards.
export async function sendHeartbeat(): Promise<HeartbeatResult> {
  if (!telemetryEnabled()) return { sent: false, reason: "telemetry disabled" };
  const id = await installId();
  if (!id) return { sent: false, reason: "no stable install id" };

  const payload: HeartbeatPayload = { install_id: id, version: LATEST.version };
  try {
    const res = await fetch(process.env.DISPATCHSEO_TELEMETRY_URL || ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { sent: false, reason: `receiver returned ${res.status}` };
    return { sent: true, version: payload.version };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
