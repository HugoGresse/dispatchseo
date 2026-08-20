// Real numbers, not list-price marketing copy - read from this repo's own
// src/lib/billing.ts (TIER_LIMITS) during the session that wrote this guide
// (re-read 2026-08-20 when the prices changed). Self-hosting has no seat to
// price at all.

const CARDS = [
  {
    name: "Self-hosted",
    price: "$0/mo",
    barPct: 0,
    note: "No seat, ever. You pay your own Vercel/Supabase/GitHub free tiers, the coding-agent subscription you already run, and DataForSEO metered to your own account.",
  },
  {
    name: "Cloud Starter (yearly)",
    price: "$20/mo",
    barPct: 20,
    note: "Billed $240 once a year - one site, hosted and managed, SERP data bundled.",
  },
  {
    name: "Cloud Starter (monthly)",
    price: "$29/mo",
    barPct: 29,
    note: "The same plan month to month, cancel anytime - one site, hosted and managed.",
  },
] as const;

export function FounderCostScorecard() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {CARDS.map((c) => (
        <div key={c.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-neutral-100">{c.name}</h3>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-100">
            {c.price}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${Math.max(c.barPct, 4)}%` }}
            />
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-500">{c.note}</p>
        </div>
      ))}
    </div>
  );
}
