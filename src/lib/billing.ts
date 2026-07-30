import { cache } from "react";
import { Polar } from "@polar-sh/sdk";
import { db } from "./db";
import { isCloudMode } from "./cloud";
import { captureServer } from "./posthog-server";

// Polar billing for CLOUD_MODE (Neo's 2026-07-22 decision: Polar as merchant
// of record). One subscriptions row per user (migration 0031), upserted by
// the webhook; tier limits live denormalized on the row so enforcement never
// calls Polar on the hot path. Self-host never touches any of this.
//
// NOTE on MCP parity: billing is ACCOUNT state, not project state - the MCP
// bearer token identifies a project, not a user, so there is deliberately no
// MCP counterpart for checkout/portal.

export type Tier = "starter" | "growth" | "scale";

export const TIER_LIMITS: Record<Tier, { sites: number; keywords: number; price: number }> = {
  starter: { sites: 1, keywords: 100, price: 49 },
  growth: { sites: 3, keywords: 300, price: 99 },
  scale: { sites: 10, keywords: 1000, price: 149 },
};

// Product ids come from the Polar dashboard once the three products exist.
export function productIdForTier(tier: Tier): string | null {
  const key = {
    starter: "POLAR_PRODUCT_STARTER",
    growth: "POLAR_PRODUCT_GROWTH",
    scale: "POLAR_PRODUCT_SCALE",
  }[tier];
  return process.env[key] ?? null;
}

export function tierForProductId(productId: string): Tier | null {
  for (const tier of ["starter", "growth", "scale"] as const) {
    if (productIdForTier(tier) === productId) return tier;
  }
  return null;
}

export function polarConfigured(): boolean {
  return Boolean(process.env.POLAR_ACCESS_TOKEN);
}

export function polar(): Polar {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) throw new Error("POLAR_ACCESS_TOKEN is not set");
  return new Polar({
    accessToken,
    server: process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
}

export type Subscription = {
  user_id: string;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  tier: Tier;
  status: string;
  sites_limit: number;
  keywords_limit: number;
  current_period_end: string | null;
};

// Per-request memo, POSITIVE RESULTS ONLY. cache(() => new Map()) hands every
// request its own map; with no request scope (scripts, module init, cron
// module load) React calls the factory fresh each time, which just means no
// memoizing - never an error.
//
// Only a FOUND subscription is memoized, and that restraint is load-bearing
// twice over. A null here is either a transient read error or "hasn't landed
// yet", and both can legitimately change inside one request:
//   - /onboarding polls this in a server-side retry loop while it waits for
//     the Polar webhook (onboarding/page.tsx). Memoizing the first null would
//     make every retry return it and bounce someone who JUST paid.
//   - planGate treats a null as "subscription inactive" and DENIES. Memoizing
//     an error-null would turn one blipped read into a whole cron run's worth
//     of denials for that owner.
// A found subscription can't change mid-request (only the webhook writes one,
// in its own request), so caching that direction is free.
const subscriptionMemo = cache(() => new Map<string, Subscription>());

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const memo = subscriptionMemo();
  const hit = memo.get(userId);
  if (hit) return hit;
  const { data, error } = await db()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  const sub = (data as Subscription) ?? null;
  if (sub) memo.set(userId, sub);
  return sub;
}

// Error-SURFACING twin of getSubscription, for the one caller where "couldn't
// read it" must never be mistaken for "there isn't one": account deletion.
// getSubscription stays deliberately tolerant - its other callers gate access
// and failing open is right there - but deleteAccount uses the answer to decide
// whether to cancel billing, so a transient read error would delete the account
// and leave the card being charged with no dashboard left to cancel from. That
// is the precise outcome deleteAccount's own header calls unrecoverable.
export async function getSubscriptionOrThrow(userId: string): Promise<Subscription | null> {
  const { data, error } = await db()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Subscription) ?? null;
}

export function isActive(sub: Subscription | null): boolean {
  return sub?.status === "active" || sub?.status === "trialing";
}

// The webhook's single write path. Missing tier (unknown product) keeps the
// stored tier; status always updates so a cancellation is never missed.
export async function applySubscriptionState(state: {
  userId: string;
  status: string;
  tier?: Tier | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
}): Promise<void> {
  const limits = state.tier ? TIER_LIMITS[state.tier] : null;
  const row: Record<string, unknown> = {
    user_id: state.userId,
    provider: "polar",
    status: state.status,
    updated_at: new Date().toISOString(),
  };
  if (state.tier) {
    row.tier = state.tier;
    row.sites_limit = limits!.sites;
    row.keywords_limit = limits!.keywords;
  }
  if (state.providerCustomerId !== undefined) row.provider_customer_id = state.providerCustomerId;
  if (state.providerSubscriptionId !== undefined)
    row.provider_subscription_id = state.providerSubscriptionId;
  if (state.currentPeriodEnd !== undefined) row.current_period_end = state.currentPeriodEnd;
  const { error } = await db().from("subscriptions").upsert(row, { onConflict: "user_id" });
  // THROW, do not swallow. This is the only write to `subscriptions` anywhere in
  // the repo, and there is no reconciliation job to repair a dropped one - so a
  // swallowed error here is permanent. Returning void meant the webhook route
  // could not tell the write had failed and answered 200, Polar recorded a
  // successful delivery, and it never redelivered. Both directions hurt: a
  // customer who just paid is left with no plan (every cron gated, /plans still
  // showing them pricing) while their card is charged monthly, and a lost
  // cancellation strands the row at "active" forever, so a non-paying account
  // keeps full access and keeps spending the platform's DataForSEO budget.
  // Throwing gives the route a 500, which is exactly the signal Polar's retry
  // schedule exists for; the upsert is idempotent on user_id, so redelivery is
  // safe (2026-07-27).
  if (error) {
    // Carry the Postgres code so the webhook can tell a PERMANENT failure from
    // a transient one. 23503 (foreign-key violation) means the auth user row is
    // gone - subscriptions.user_id cascades from auth.users, so deleting an
    // account removes the row, and any later Polar event for that customer
    // (the revoke we ourselves triggered, or a renewal) can never be written.
    // Retrying that forever would burn all 10 of Polar's attempts and get the
    // endpoint auto-disabled for EVERY customer.
    const err = new Error(`subscription upsert failed: ${error.message}`) as Error & {
      pgCode?: string;
    };
    err.pgCode = error.code;
    throw err;
  }
  const event = ["active", "trialing"].includes(state.status)
    ? "subscription_activated"
    : ["canceled", "revoked"].includes(state.status)
      ? "subscription_canceled"
      : "subscription_updated";
  await captureServer(state.userId, event, { tier: state.tier ?? undefined, status: state.status });
}

// How many more sites this user's plan allows. null = unlimited (self-host,
// or cloud with billing not yet configured - fail open, never lock the
// owner out of their own product because an env var is missing).
export async function remainingSites(userId: string): Promise<number | null> {
  if (!isCloudMode() || !polarConfigured()) return null;
  const sub = await getSubscription(userId);
  if (!isActive(sub)) return 0;
  const { count } = await db()
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);
  return Math.max(0, sub!.sites_limit - (count ?? 0));
}

// Same positive-only memo as getSubscription above, for the same reason: a
// null is "self-host / pre-0031 / couldn't read it", any of which can differ
// on the next call within a request (project creation sets an owner mid-flow),
// while a found owner is immutable for the life of the request.
const projectOwnerMemo = cache(() => new Map<string, string>());

// The owner lookup planGate, remainingKeywords, and platformBudgetGate (see
// dataforseo-usage.ts) all need: which user owns this project, or null for
// self-host/pre-0031 rows. Collapses any lookup error the same way every
// caller already tolerated - "can't tell who owns it" reads as "don't gate".
export async function ownerUserIdForProject(projectId: string): Promise<string | null> {
  const memo = projectOwnerMemo();
  const hit = memo.get(projectId);
  if (hit) return hit;
  const { data, error } = await db()
    .from("projects")
    .select("owner_user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  const ownerId = (data as { owner_user_id: string | null }).owner_user_id;
  if (ownerId) memo.set(projectId, ownerId);
  return ownerId;
}

// The projects an owner's plan actually covers: the OLDEST sites_limit ones.
// Deterministic and stable, so a Scale->Starter downgrade doesn't delete
// anything - the newest sites just fall outside coverage (crons skip them,
// data stays, upgrading re-covers them instantly).
async function ownedProjectsOldestFirst(ownerId: string): Promise<string[]> {
  const { data } = await db()
    .from("projects")
    .select("id")
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

// Is this project covered by its owner's current plan? Crons call this per
// project; not-allowed is an informational skip (the "crons never run what
// setup hasn't finished" pattern), never an error. Self-host, unconfigured
// billing, and ownerless projects are always allowed.
export async function planGate(
  projectId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (!isCloudMode() || !polarConfigured()) return { allowed: true };
  const ownerId = await ownerUserIdForProject(projectId); // null = pre-0031 row or no owner
  if (!ownerId) return { allowed: true };
  const sub = await getSubscription(ownerId);
  if (!isActive(sub)) return { allowed: false, reason: "subscription inactive" };
  const covered = (await ownedProjectsOldestFirst(ownerId)).slice(0, sub!.sites_limit);
  if (!covered.includes(projectId)) {
    return { allowed: false, reason: `beyond the plan's ${sub!.sites_limit}-site limit` };
  }
  return { allowed: true };
}

// The tracked-keyword allowance left on this project's ACCOUNT plan (the
// limit is per account, not per site - otherwise 3 sites x 300 would
// triple the quota). Tracked keywords x daily SERP checks is ~90% of
// DataForSEO cost, so this cap is the real abuse guard. null = unlimited
// (self-host, billing unconfigured, or ownerless project). owner_user_id is
// looked up directly because the MCP's currentProject() doesn't carry it.
export async function remainingKeywords(projectId: string): Promise<number | null> {
  if (!isCloudMode() || !polarConfigured()) return null;
  // Column/table missing (pre-0031) or no owner: don't cap.
  const ownerId = await ownerUserIdForProject(projectId);
  if (!ownerId) return null;
  const sub = await getSubscription(ownerId);
  if (!isActive(sub)) return 0;
  const owned = await ownedProjectsOldestFirst(ownerId);
  const { count } = await db()
    .from("keywords")
    .select("id", { count: "exact", head: true })
    .in("project_id", owned)
    .eq("status", "tracking");
  return Math.max(0, sub!.keywords_limit - (count ?? 0));
}
