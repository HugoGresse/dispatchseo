import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { getSubscription, isActive, polarConfigured, TIER_LIMITS, type Tier } from "@/lib/billing";
import { foundingOffer, foundingPriceLabel, listPriceLabel } from "@/lib/founding";
import { DispatchMark } from "@/components/logo";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

export const dynamic = "force-dynamic";

// Standalone post-signup plan picker. This is the FIRST screen a fresh cloud
// account lands on - no dashboard sidebar, no chrome, just "welcome, pick a
// plan". Once a subscription is active they're bounced to onboarding to set up
// their first site; self-host has no billing and goes straight to the app.

const TIER_COPY: Record<
  Tier,
  { name: string; tagline: string; cta: string; recommended: boolean }
> = {
  starter: {
    name: "Starter",
    tagline: "One site on autopilot",
    cta: "Start free trial",
    recommended: false,
  },
  growth: {
    name: "Growth",
    tagline: "For a small portfolio",
    cta: "Choose Growth",
    recommended: true,
  },
  scale: {
    name: "Scale",
    tagline: "Portfolios and agencies",
    cta: "Choose Scale",
    recommended: false,
  },
};

// Truthful to what the SEO autopilot actually does - no invented numbers.
const CAPABILITIES = [
  "Autonomous keyword research",
  "Daily rank + Search Console tracking",
  "One-tap PR merge for content",
];

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4.5 10.5l3.2 3.2 7.8-8.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Clay (#d97757 fill / #e08a68 text) is the mascot's colour and, on both
// pricing surfaces, the founding offer's. Violet stays the product's - so
// "Most popular" and "Founding price" read as two different kinds of claim
// instead of competing for the same accent. Written as literals because
// Tailwind's scanner can't see a runtime constant.
function Lock({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

function Clock({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export default async function PlansPage() {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) redirect("/dashboard");
  const sub = await getSubscription(auth.user.id);
  if (isActive(sub)) redirect("/onboarding?new=1");

  // null = offer over (or billing unconfigured); every branch below then
  // renders the plain list price with nothing left dangling.
  const founding = await foundingOffer();
  const tiers = Object.keys(TIER_LIMITS) as Tier[];

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-5 py-8 sm:px-6 sm:py-10">
      {/* Signature: a soft violet pool bleeding down from the top, densest
          behind the recommended card. Kept low-opacity so it reads as
          atmosphere, not decoration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(60%_50%_at_50%_-8%,rgba(139,92,246,0.16),transparent_70%)]"
      />

      <div className="mx-auto w-full max-w-5xl">
        {/* Brand bar - mirrors the onboarding shell so the two standalone
            screens feel like one flow. */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2.5 text-lg font-semibold text-white">
            <DispatchMark className="h-7 w-auto" />
            DispatchSEO
          </p>
        </div>

        {/* Welcome hero. The mascot settles in for the shift, then the ask. */}
        <div className="mt-10 flex flex-col items-center text-center sm:mt-14">
          <PixelDispatcher className="mb-6 w-[min(200px,60vw)]" />
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Choose your plan
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-400">
            Pick a plan to put your site&apos;s SEO on autopilot. Starter includes a 7-day free
            trial &mdash; cancel anytime.
          </p>

          {/* The offer, stated once. The cards carry the numbers. */}
          {founding ? (
            <div className="mt-8 max-w-xl border-t border-neutral-800/80 pt-7">
              <p className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                Founding price:{" "}
                <span className="rounded-[4px] bg-[#d97757] px-1.5 pb-0.5 text-neutral-950">
                  {founding.discountPct}% off
                </span>
                , locked for life.
              </p>
              {/* Template literal, not interpolated JSX text - SWC strips the
                  leading space of a text chunk that wraps to the next line. */}
              <p className="mt-2.5 text-sm leading-relaxed text-neutral-400">
                {`I'm capping this at ${founding.cap} because that's how many sites I can personally onboard and support while still building. When it's full, it's full.`}
              </p>
              <p className="mt-3.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-neutral-500">
                <Clock className="h-3.5 w-3.5 text-[#e08a68]" />
                <span>
                  Ends{" "}
                  <b className="font-semibold text-neutral-300">{founding.endsAtLabel}</b>
                </span>
                {founding.showCount ? (
                  <>
                    <span aria-hidden="true" className="h-1 w-1 rounded-full bg-neutral-700" />
                    <b className="font-semibold text-neutral-300">
                      {`${founding.remaining} of ${founding.cap} left`}
                    </b>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}
        </div>

        {!polarConfigured() ? (
          <p className="mx-auto mt-8 max-w-xl rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-300">
            Billing isn&apos;t configured on this deployment yet (POLAR_* env vars missing).
          </p>
        ) : null}

        {/* Plans. Decision-first order inside each card (price -> CTA -> the
            comparison list) keeps the buttons aligned across tiers. */}
        <div className="mt-12 grid items-start gap-5 sm:grid-cols-3">
          {tiers.map((tier) => {
            const limits = TIER_LIMITS[tier];
            const copy = TIER_COPY[tier];
            const rec = copy.recommended;
            return (
              <div
                key={tier}
                className={[
                  "relative flex flex-col rounded-2xl p-6 transition duration-200",
                  rec
                    ? "z-10 border border-violet-500/40 bg-neutral-900/60 ring-1 ring-violet-500/20 shadow-[0_0_70px_-20px_rgba(139,92,246,0.55)] hover:-translate-y-0.5 hover:border-violet-500/60 lg:scale-[1.035]"
                    : "border border-neutral-800 bg-neutral-900/40 hover:-translate-y-0.5 hover:border-neutral-700",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-white">{copy.name}</h2>
                  {rec ? (
                    <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-violet-300 ring-1 ring-inset ring-violet-500/30">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-neutral-400">{copy.tagline}</p>

                {/* Struck list price sits on its own line above the number, not
                    beside it: at the sm breakpoint a third of 640px cannot hold
                    "$149 $74.50 /mo" on one row. */}
                {founding ? (
                  <p className="mt-5 text-sm font-semibold tabular-nums text-neutral-600">
                    <s className="decoration-[#d97757] decoration-2">
                      <span className="sr-only">Regular price </span>
                      {listPriceLabel(tier)}
                    </s>
                  </p>
                ) : null}
                <div
                  className={`flex flex-wrap items-baseline gap-x-1 ${founding ? "mt-0.5" : "mt-5"}`}
                >
                  <span className="text-4xl font-semibold tracking-tight tabular-nums text-white">
                    {founding ? foundingPriceLabel(tier) : listPriceLabel(tier)}
                  </span>
                  <span className="text-sm text-neutral-500">/mo</span>
                </div>
                {founding ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#e08a68]">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    Founding price
                  </p>
                ) : null}
                {tier === "starter" ? (
                  <p className="mt-1.5 text-xs font-medium text-emerald-300">7-day free trial</p>
                ) : (
                  <p className="mt-1.5 text-xs font-medium text-neutral-500">Billed today</p>
                )}

                <a
                  href={`/api/polar/checkout?tier=${tier}`}
                  className={[
                    "mt-6 flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                    rec
                      ? "bg-white text-neutral-950 hover:bg-neutral-200"
                      : "border border-neutral-700 bg-neutral-900 text-white hover:border-violet-500/40 hover:bg-neutral-800/60",
                  ].join(" ")}
                >
                  {copy.cta}
                </a>

                <div className="mt-6 border-t border-neutral-800 pt-6">
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-start gap-2.5 text-neutral-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                      <span>
                        <span className="font-medium text-white tabular-nums">{limits.sites}</span>{" "}
                        site{limits.sites === 1 ? "" : "s"}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-neutral-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                      <span>
                        <span className="font-medium text-white tabular-nums">
                          {limits.keywords}
                        </span>{" "}
                        tracked keywords
                      </span>
                    </li>
                    {CAPABILITIES.map((cap) => (
                      <li key={cap} className="flex items-start gap-2.5 text-neutral-300">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reassurance + the legal line, quiet at the base of the page. */}
        <div className="mt-10 space-y-1 text-center">
          <p className="text-sm text-neutral-500">Cancel anytime &middot; 7-day free trial on Starter</p>
          <p className="text-sm text-neutral-500">
            By subscribing you agree to the{" "}
            <a className="text-neutral-300 underline underline-offset-2" href="/terms">
              terms of service
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
