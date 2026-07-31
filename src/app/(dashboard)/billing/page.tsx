import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import {
  getSubscription,
  isActive,
  polarConfigured,
  TIER_LIMITS,
  type Tier,
} from "@/lib/billing";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { platformUsageStatus } from "@/lib/dataforseo-usage";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CancelPlan } from "@/components/cancel-plan";

export const dynamic = "force-dynamic";

// Cloud-only plan page: current subscription + the three tiers. Checkout and
// the customer portal are handled by Polar's hosted pages; this page only
// links out. Self-host has no billing, so it bounces home.

const TIER_COPY: Record<Tier, { name: string; sub: string }> = {
  starter: { name: "Starter", sub: "One site on autopilot" },
  growth: { name: "Growth", sub: "For a small portfolio" },
  scale: { name: "Scale", sub: "Portfolios and agencies" },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) redirect("/dashboard");
  const { success, error } = await searchParams;
  const sub = await getSubscription(auth.user.id);
  const active = isActive(sub);
  // A subscription Polar still holds, whatever its payment state. `active`
  // (active|trialing) decides what we UNLOCK; this decides where a plan button
  // may send someone. past_due is not active - the plan is unpaid - but the
  // subscription does still exist upstream, so the way out is the portal (fix
  // the card, prorate, replace). A fresh checkout would stack a second
  // subscription beside the unpaid one and charge the same account twice.
  const hasUpstreamSub = Boolean(sub && ["active", "trialing", "past_due"].includes(sub.status));
  // Usage is metered per project (the shared budget is per-owner, but
  // check_serp's daily cap is per-project) - read it off the dashboard's
  // active project. A brand-new active subscriber with no project yet just
  // doesn't see the section; getActiveProjectOrNull never redirects.
  const activeProject = active && polarConfigured() ? await getActiveProjectOrNull() : null;
  const usage = activeProject ? await platformUsageStatus(activeProject.id) : null;
  // Only for the sentence the cancel box writes ("your 3 sites stop being
  // managed"). A failed count is not worth failing the page over - it reads as
  // one site, which is what the overwhelming majority have.
  const siteCount = hasUpstreamSub
    ? ((
        await db()
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("owner_user_id", auth.user.id)
      ).count ?? 1)
    : 0;
  // Same format the cancel panel uses, so the header and the panel can never
  // disagree about the date.
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const periodEndLabel =
    periodEnd && !Number.isNaN(periodEnd.getTime())
      ? periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Billing"
        hint={
          active
            ? `You're on ${TIER_COPY[sub!.tier].name} - ${sub!.sites_limit} site${sub!.sites_limit === 1 ? "" : "s"}, ${sub!.keywords_limit} tracked keywords.${
                // A cancelled-but-still-running plan says so in the FIRST line
                // on the page, not only in the panel further down. The whole
                // question someone has after cancelling is "do I still have it
                // until the date?", and the answer is yes.
                sub!.cancel_at_period_end && periodEndLabel
                  ? ` Active until ${periodEndLabel}.`
                  : ""
              }`
            : "Pick a plan to unlock your sites - Starter comes with a 7-day free trial; Growth and Scale start today."
        }
      />

      {success ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-900 bg-emerald-950/40 px-4 py-3">
          <p className="text-sm text-emerald-300">
            Payment received - your plan is active. Welcome aboard.
          </p>
          <a
            href="/onboarding?new=1"
            className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950"
          >
            Set up your site →
          </a>
        </div>
      ) : null}
      {error === "no-customer" ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
          {active ? (
            <>
              We couldn&apos;t open the billing portal - this account has no payment record with our
              provider. If you just subscribed, give it a minute and retry; otherwise email{" "}
              <a href="mailto:support@dispatchseo.com" className="underline underline-offset-2">
                support@dispatchseo.com
              </a>{" "}
              and we&apos;ll sort it out.
            </>
          ) : (
            "No billing history yet - pick a plan first."
          )}
        </p>
      ) : null}
      {!polarConfigured() ? (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Billing isn&apos;t configured on this deployment yet (POLAR_* env vars missing).
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(TIER_COPY) as Tier[]).map((tier) => {
          const limits = TIER_LIMITS[tier];
          const isCurrent = active && sub?.tier === tier;
          return (
            <div
              key={tier}
              className={`rounded-xl border p-5 ${isCurrent ? "border-white/40 bg-neutral-900" : "border-neutral-800 bg-neutral-950"}`}
            >
              <h3 className="font-semibold text-white">{TIER_COPY[tier].name}</h3>
              <p className="mt-1 text-2xl font-bold text-white">
                ${limits.price}
                <span className="text-sm font-normal text-neutral-500">/mo</span>
              </p>
              <p className="mt-1 text-sm text-neutral-400">{TIER_COPY[tier].sub}</p>
              {!active ? (
                tier === "starter" ? (
                  <p className="mt-1 text-xs font-medium text-emerald-300">7-day free trial</p>
                ) : (
                  <p className="mt-1 text-xs font-medium text-neutral-500">Billed today</p>
                )
              ) : null}
              <ul className="mt-3 space-y-1 text-sm text-neutral-400">
                <li>
                  Up to {limits.sites} site{limits.sites === 1 ? "" : "s"}
                </li>
                <li>{limits.keywords} tracked keywords</li>
              </ul>
              {/* The SECOND door to checkout, and the one that was missing this.
                  /plans is where a new customer picks a tier; this page is where
                  an existing one upgrades - and an upgrade from Starter is
                  exactly the moment a GitHub bill becomes possible for someone
                  it never applied to before. Finding out afterwards would be
                  the "oh, by the way" this note exists to prevent, so it has to
                  sit above the button, not behind it.
                  Multi-site tiers only: one site cannot leave GitHub's free
                  tier, so on Starter this would warn about the impossible. */}
              {tier !== "starter" ? (
                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                  Above 2 sites, GitHub bills you directly for the automation it runs - about $5
                  per extra site a month, with nothing added by us.
                </p>
              ) : null}
              {isCurrent ? (
                <p className="mt-4 text-center text-sm font-medium text-neutral-300">
                  Current plan
                </p>
              ) : (
                <a
                  // Existing subscribers change plans in Polar's portal (it
                  // prorates and REPLACES the subscription); a fresh checkout
                  // would stack a second parallel subscription.
                  //
                  // Gated on hasUpstreamSub, NOT on active. This read `active`
                  // until 2026-07-30, which meant a past_due subscriber - the
                  // one person most likely to come here and click something -
                  // got a checkout link and a SECOND subscription billed
                  // alongside the unpaid one. hasUpstreamSub was written for
                  // this line (see its comment above) and never wired to it.
                  href={hasUpstreamSub ? "/api/polar/portal" : `/api/polar/checkout?tier=${tier}`}
                  className="mt-4 block rounded-lg bg-white px-4 py-2 text-center text-sm font-medium text-neutral-950"
                >
                  {hasUpstreamSub
                    ? `Switch ${TIER_COPY[tier].name}`
                    : tier === "starter"
                      ? "Start free trial"
                      : `Choose ${TIER_COPY[tier].name}`}
                </a>
              )}
            </div>
          );
        })}
      </div>

      {usage ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="font-semibold text-white">DataForSEO usage this period</h3>
          {usage.billed_to === "platform" ? (
            <>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-neutral-300">
                    ${usage.month_to_date_usd.toFixed(2)} of ${usage.budget_usd.toFixed(2)}
                  </span>
                  <span className="text-neutral-500">{Math.min(usage.percent_used, 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${
                      usage.percent_used >= 100
                        ? "bg-red-500"
                        : usage.percent_used >= 80
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                    }`}
                    style={{ width: `${Math.min(usage.percent_used, 100)}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 text-sm text-neutral-400">
                check_serp today: {usage.check_serp_today} of {usage.check_serp_daily_cap}
              </p>
              {usage.pacing !== "normal" ? (
                <p className="mt-2 text-sm text-amber-400">
                  {usage.pacing === "slowed"
                    ? `On pace to exceed this month's budget (projected $${usage.projected_usd.toFixed(2)}) - rank checks have shifted to every other day so tracking never stops.`
                    : `Projected spend ($${usage.projected_usd.toFixed(2)}) is past this month's budget - rank checks run as a weekly sweep until the period resets.`}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-neutral-500">
                Resets{" "}
                {new Date(usage.resets_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                UTC. Connect your own DataForSEO account on{" "}
                <Link href="/settings" className="text-neutral-300 underline">
                  Settings
                </Link>{" "}
                for unmetered usage.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">
              {usage.billed_to === "own"
                ? "Your active project uses its own connected DataForSEO account - it doesn't draw from a plan budget."
                : "Your active project has no DataForSEO connected yet, so there's nothing to meter."}
            </p>
          )}
        </div>
      ) : null}

      {hasUpstreamSub ? (
        <CancelPlan
          pending={sub!.cancel_at_period_end}
          endsAt={sub!.current_period_end}
          tierName={TIER_COPY[sub!.tier].name}
          siteCount={siteCount}
        />
      ) : null}

      <p className="text-sm text-neutral-500">
        Invoices, payment method, plan changes:{" "}
        <a className="text-neutral-300 underline" href="/api/polar/portal">
          open the billing portal
        </a>
        . By subscribing you agree to the{" "}
        <a className="text-neutral-300 underline" href="/terms">
          terms of service
        </a>
        .
      </p>
    </div>
  );
}
