import { db } from "./db";
import { isCloudMode } from "./cloud";
import { polarConfigured, TIER_LIMITS, type Tier } from "./billing";

// The founding-customer offer: 50% off the list price, locked for life, for
// the first 50 sites. This is the ONLY place the offer is defined - the
// landing, /plans, and the Polar checkout route all read it from here, so
// there is exactly one answer to "is it live", "what does it cost", and
// "how many are left".
//
// It is deliberately NOT a second price table: the founding price is always
// computed from TIER_LIMITS x the discount, so editing billing.ts moves both
// numbers together and the two can never disagree.

export const FOUNDING_CAP = 50;
// The last moment the offer is live. The label says "October 1, 2026" and
// means through that whole day, hence 23:59:59 rather than midnight. Must
// match the "Ends at" date on the Polar discount, or the page and the
// checkout disagree about when the offer stops.
export const FOUNDING_ENDS_AT = "2026-10-01T23:59:59Z";
// Below this many sold, the page shows the cap and the deadline but says
// nothing about how many are gone - a live counter reading "2 sold" only
// advertises that nobody bought yet.
export const FOUNDING_COUNT_VISIBLE_AT = 15;
export const FOUNDING_DISCOUNT_PCT = 50;

export type FoundingOffer = {
  live: true;
  cap: number;
  discountPct: number;
  endsAt: Date;
  /** "October 1, 2026" - formatted once here so every surface agrees. */
  endsAtLabel: string;
  /** Founding seats taken, or null when the count could not be read. */
  sold: number | null;
  /** cap - sold, or null when sold is unknown. */
  remaining: number | null;
  /** True only when sold >= FOUNDING_COUNT_VISIBLE_AT and remaining is real. */
  showCount: boolean;
};

// ---------------------------------------------------------------- money ----

// 49 -> 24.50. Half-dollars are real, so they are SHOWN, never rounded: the
// number on the page has to equal the number Polar charges.
export function foundingPrice(tier: Tier): number {
  return TIER_LIMITS[tier].price * (1 - FOUNDING_DISCOUNT_PCT / 100);
}

export function priceLabel(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function listPriceLabel(tier: Tier): string {
  return priceLabel(TIER_LIMITS[tier].price);
}

export function foundingPriceLabel(tier: Tier): string {
  return priceLabel(foundingPrice(tier));
}

// --------------------------------------------------------------- counter ----

// Founding seats taken. null = "can't tell" (billing table missing, Supabase
// unreachable, env not wired) - never a guess, never a seeded number. Callers
// treat null as "offer still live, count unknown", which is the only honest
// degradation: a DB hiccup must not silently end the offer or invent demand.
async function foundingSold(): Promise<number | null> {
  try {
    const { count, error } = await db()
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "trialing"])
      .lt("created_at", FOUNDING_ENDS_AT);
    if (error) {
      console.error(`[founding] seat count unavailable: ${error.message}`);
      return null;
    }
    return count ?? null;
  } catch (err) {
    console.error(`[founding] seat count threw: ${(err as Error).message}`);
    return null;
  }
}

// -------------------------------------------------------------- the door ----

// The single entry point. null means "no founding offer" and every surface
// reverts to plain list prices with no leftover struck-through text - that
// covers self-host, unconfigured billing, past the end date, and cap reached.
export async function foundingOffer(): Promise<FoundingOffer | null> {
  // Self-host has no billing at all, so it never gets the offer and never
  // pays for the DB round-trip.
  if (!isCloudMode() || !polarConfigured()) return null;

  const endsAt = new Date(FOUNDING_ENDS_AT);
  if (Date.now() > endsAt.getTime()) return null;

  const sold = await foundingSold();
  if (sold !== null && sold >= FOUNDING_CAP) return null;

  const remaining = sold === null ? null : Math.max(0, FOUNDING_CAP - sold);
  return {
    live: true,
    cap: FOUNDING_CAP,
    discountPct: FOUNDING_DISCOUNT_PCT,
    endsAt,
    endsAtLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(endsAt),
    sold,
    remaining,
    showCount: sold !== null && sold >= FOUNDING_COUNT_VISIBLE_AT,
  };
}
