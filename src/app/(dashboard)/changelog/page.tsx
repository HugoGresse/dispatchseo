import { requireDashboard } from "@/lib/auth-gate";
import { PageHeader } from "@/components/ui";
import { CHANGELOG, LATEST, anchorFor, type ChangeKind } from "@/lib/changelog";

export const dynamic = "force-dynamic";

// The update log. Content comes from src/lib/changelog.ts - the same list the
// dashboard banner announces and the get_changelog MCP tool serves - so a
// release is written once and shows up in all three.
//
// No project needed (this is about the product, not a site), so it only takes
// the auth gate, not requireOnboarded: a half-set-up owner can still read it.

const KIND_STYLES: Record<ChangeKind, string> = {
  new: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  improved: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  fixed: "border-neutral-700 bg-neutral-800/60 text-neutral-400",
};

const KIND_LABELS: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ChangelogPage() {
  await requireDashboard();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="What's new"
        hint="Everything that shipped in DispatchSEO itself. Your site's own activity lives on Home."
      />

      <div className="space-y-4">
        {CHANGELOG.map((entry) => (
          <section
            key={entry.version}
            id={anchorFor(entry.version)}
            // scroll-mt clears the sticky topbar when the banner links straight
            // to a release; target:ring lights up the one that was linked to.
            className="scroll-mt-20 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 transition-colors target:border-neutral-600 target:ring-1 target:ring-neutral-600"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold text-white">{entry.title}</h2>
              {entry.version === LATEST?.version ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  Latest
                </span>
              ) : null}
              <time dateTime={entry.date} className="ml-auto text-xs text-neutral-500">
                {longDate(entry.date)}
              </time>
            </div>
            <p className="mt-1 text-sm text-neutral-400">{entry.summary}</p>
            <ul className="mt-4 space-y-2.5">
              {entry.changes.map((c, i) => (
                <li key={i} className="flex gap-3 text-sm text-neutral-300">
                  <span
                    className={`mt-0.5 h-fit shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${KIND_STYLES[c.kind]}`}
                  >
                    {KIND_LABELS[c.kind]}
                  </span>
                  <span className="min-w-0">{c.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-xs text-neutral-600">
        Updates apply themselves — nothing here needs an action from you.
      </p>
    </div>
  );
}
