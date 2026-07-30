import Link from "next/link";
import type { PlanNotice } from "@/lib/billing";

// The banner a lapsed account sees on every dashboard screen.
//
// It exists because an inactive plan is otherwise INVISIBLE from inside the
// product: dashboard access is never revoked, so every page still loads with
// every past result on it, while planGate has quietly turned all the crons into
// skips. Ranks stop moving, Search Console stops importing, the builder stops
// building - and until this banner there was nothing anywhere on the dashboard
// that said why. "My SEO tool broke" and "my plan ended" look identical from
// that side of the screen, and only one of them is true.
//
// NOT dismissible, and that's the point. Every other banner in this layout
// reports something that happened once; this one reports a condition that is
// still true and will stay true until the owner acts. A dismiss button would
// rebuild the exact silence it was written to end.
//
// Server component - it renders a state and two links, so there is no reason to
// ship any JavaScript for it.

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function PlanLapsedBanner({ notice }: { notice: PlanNotice }) {
  const when = formatDate(notice.endedAt);
  const pastDue = notice.kind === "past_due";

  return (
    <div
      role="status"
      className="border-b border-amber-500/25 bg-amber-500/10 px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <p className="min-w-0 flex-1 leading-relaxed text-amber-200/90">
          <b className="font-medium text-amber-100">
            {pastDue
              ? "Your last payment didn't go through, so your sites are paused."
              : `Your plan ended${when ? ` on ${when}` : ""}, so your sites are paused.`}
          </b>{" "}
          {/* Say what's stopped AND what's safe, in that order. "Paused" alone
              reads as data loss to anyone who has ever been locked out of a
              SaaS, and the honest answer is that nothing was touched. */}
          Rank tracking, Search Console imports and the overnight builder have all stopped. Nothing
          has been deleted - your sites, keywords and history are exactly where you left them, and{" "}
          {pastDue ? "updating your card" : "picking a plan"} starts everything again.
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {pastDue ? (
            <a
              href="/api/polar/portal"
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Update payment
            </a>
          ) : (
            <Link
              href="/billing"
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Pick a plan
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
