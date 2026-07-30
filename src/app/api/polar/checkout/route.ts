import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/cloud-auth";
import { isCloudMode } from "@/lib/cloud";
import {
  getSubscription,
  polar,
  polarConfigured,
  productIdForTier,
  type Tier,
} from "@/lib/billing";
import { foundingOffer } from "@/lib/founding";
import { captureServer } from "@/lib/posthog-server";

// GET /api/polar/checkout?tier=starter|growth|scale - sends the signed-in
// user to a Polar checkout for that tier. externalCustomerId ties the Polar
// customer to the Supabase user id, which is what the webhook maps back on.
export async function GET(req: NextRequest) {
  if (!isCloudMode() || !polarConfigured()) {
    return NextResponse.json({ error: "billing not enabled" }, { status: 404 });
  }
  const user = await currentUser();
  if (!user) redirect("/login");

  const tier = (req.nextUrl.searchParams.get("tier") ?? "") as Tier;
  const productId = productIdForTier(tier);
  if (!productId) return NextResponse.json({ error: "unknown tier" }, { status: 400 });

  // Last line of defence against a SECOND parallel subscription on one account.
  // Both callers already try to avoid it - /plans redirects an active subscriber
  // away, and /billing points them at the portal (which prorates and REPLACES
  // rather than stacking) - but both of those decisions rest on getSubscription,
  // which deliberately collapses a read error to null. So a transient Supabase
  // blip is enough to show a paying customer the pricing page and let them buy a
  // plan they already have, and their card gets charged twice with no
  // reconciliation job to catch it. This route is the only place the charge
  // actually originates, so the check belongs here too. past_due is included on
  // purpose: the subscription still exists at Polar, so the fix for a failed
  // payment is the portal, not a second subscription beside the unpaid one.
  const existing = await getSubscription(user.id);
  if (existing && ["active", "trialing", "past_due"].includes(existing.status)) {
    redirect("/api/polar/portal");
  }

  // Founding offer: a "50% off, forever" discount created in the Polar
  // dashboard. Advertising half price on the landing while checkout charges
  // list price would overcharge every founding customer, so the same
  // foundingOffer() the pricing UI reads also gates the discount here. The env
  // var is checked FIRST so an unset var means zero extra work and byte-identical
  // behaviour to before the offer existed.
  const foundingDiscountId = process.env.POLAR_FOUNDING_DISCOUNT_ID;
  const discountId = foundingDiscountId && (await foundingOffer()) ? foundingDiscountId : null;

  const origin = req.nextUrl.origin;
  const checkout = await polar().checkouts.create({
    products: [productId],
    externalCustomerId: user.id,
    customerEmail: user.email ?? undefined,
    ...(discountId ? { discountId } : {}),
    // Straight into the wizard - the onboarding gate absorbs the webhook
    // race (checkout=success renders a confirming poll, never a bounce
    // back to /billing after the user just paid).
    successUrl: `${origin}/onboarding?new=1&checkout=success`,
  });
  await captureServer(user.id, "checkout_started", { tier, discounted: Boolean(discountId) });
  redirect(checkout.url);
}
