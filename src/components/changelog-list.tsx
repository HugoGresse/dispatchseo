"use client";

// The release log, read as a dispatch log: one row per release, threaded on a
// hairline rail down the left with a mono date stamp and a node per entry.
// Collapsed, a row is only ever three things - the date, a big title, and one
// sentence. Opening it reveals what actually shipped, GROUPED by kind (Added /
// Improved / Fixed) under a single coloured label each, instead of stamping a
// pill onto every line. Colour appears twice per release at most, so it still
// means something.
//
// The newest release opens on mount, and so does whichever release the URL
// points at (`/changelog#v-2026-07-25`) - the banner links straight to a
// release, so it has to arrive open, not collapsed.

import { useEffect, useState } from "react";
import {
  anchorFor,
  foldedInto,
  releaseLabel,
  type ChangeKind,
  type ChangelogEntry,
} from "@/lib/changelog";

const KIND_ORDER: ChangeKind[] = ["new", "improved", "fixed"];

const KIND: Record<ChangeKind, { label: string; mark: string; text: string; rule: string }> = {
  new: {
    label: "Added",
    mark: "bg-emerald-400",
    text: "text-emerald-300",
    rule: "border-emerald-400/25",
  },
  improved: {
    label: "Improved",
    mark: "bg-sky-400",
    text: "text-sky-300",
    rule: "border-sky-400/25",
  },
  fixed: {
    label: "Fixed",
    mark: "bg-neutral-500",
    text: "text-neutral-400",
    rule: "border-neutral-700",
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parsed off the ISO string rather than through Intl: this renders on the
// server and again on the client, and a timezone-sensitive date is exactly the
// kind of thing that hydrates differently and shifts a release by a day.
function dateParts(iso: string): { md: string; year: string } {
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1] ?? m;
  return { md: `${month} ${Number(d)}`, year: y };
}

function groupChanges(changes: ChangelogEntry["changes"]) {
  return KIND_ORDER.map((kind) => ({
    kind,
    items: changes.filter((c) => c.kind === kind).map((c) => c.text),
  })).filter((g) => g.items.length > 0);
}

export function ChangelogList({
  entries,
  latestVersion,
}: {
  entries: ChangelogEntry[];
  latestVersion: string | null;
}) {
  const [open, setOpen] = useState<string[]>(() => (latestVersion ? [latestVersion] : []));

  // Deep links: the browser scrolls to the anchor before hydration, but the
  // release is still collapsed, so open it and re-scroll once it has height.
  useEffect(() => {
    function openFromHash() {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!hash) return;
      // A hash can name a release directly, or name one that was folded into a
      // later release - an old Discord post deep-linking to a version that no
      // longer stands on its own still has to open the entry that absorbed it.
      const match =
        entries.find((e) => anchorFor(e.version) === hash) ??
        entries.find((e) => foldedInto(e.version).some((v) => anchorFor(v) === hash));
      if (!match) return;
      setOpen((prev) => (prev.includes(match.version) ? prev : [...prev, match.version]));
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ block: "start" });
      });
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [entries]);

  function toggle(version: string) {
    setOpen((prev) =>
      prev.includes(version) ? prev.filter((v) => v !== version) : [...prev, version],
    );
  }

  return (
    <div>
      {entries.map((entry) => (
        <Release
          key={entry.version}
          entry={entry}
          latest={entry.version === latestVersion}
          open={open.includes(entry.version)}
          onToggle={() => toggle(entry.version)}
        />
      ))}
    </div>
  );
}

function Release({
  entry,
  latest,
  open,
  onToggle,
}: {
  entry: ChangelogEntry;
  latest: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { md, year } = dateParts(entry.date);
  const label = releaseLabel(entry.version);
  const groups = groupChanges(entry.changes);
  const panelId = `panel-${entry.version}`;
  const counts = groups.map((g) => `${g.items.length} ${KIND[g.kind].label.toLowerCase()}`).join(", ");

  return (
    <article
      id={anchorFor(entry.version)}
      // scroll-mt clears the sticky header when a banner links straight here.
      className="scroll-mt-24 border-t border-neutral-800/60 first:border-t-0"
    >
      {/* Anchors for releases this one absorbed, so the Discord posts that
          announced them still land here instead of nowhere. */}
      {foldedInto(entry.version).map((v) => (
        <span key={v} id={anchorFor(v)} className="block scroll-mt-24" aria-hidden="true" />
      ))}
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          // -mx-3 px-3: the hover/focus surface reaches past the text without
          // moving the columns, so the rail stays on the same x as the panel's.
          className="group -mx-3 grid w-full grid-cols-1 gap-y-3 rounded-lg px-3 py-6 text-left transition-colors hover:bg-neutral-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-500 focus-visible:[outline-offset:-2px] motion-reduce:transition-none sm:grid-cols-[7rem_1fr] sm:gap-y-0 sm:py-7"
        >
          {/* Version stamp: inline on a phone, stacked in its own column above sm. */}
          {/* pt-2 above sm puts the stamp, the rail node and the title's first
              line on one optical centreline (all land at 16px). */}
          <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs uppercase tracking-[0.12em] sm:block sm:pt-2">
            {/* A versioned release is known by its number, so the number takes
                the stamp and the date falls in behind it. The releases from
                before versioning have only ever had a date, and keep it. */}
            {label ? (
              <>
                <span className="text-sm normal-case tracking-[0.06em] text-neutral-200">
                  {label}
                </span>
                <span className="text-neutral-600 sm:mt-1 sm:block">
                  {md} {year}
                </span>
              </>
            ) : (
              <>
                <span className="text-neutral-300">{md}</span>
                <span className="text-neutral-600">{year}</span>
              </>
            )}
            {latest ? (
              <span className="text-emerald-400/90 sm:mt-2 sm:block">Latest</span>
            ) : null}
          </span>

          <span className="relative flex min-w-0 items-start gap-4 sm:border-l sm:border-neutral-800 sm:pl-7">
            {/* Node on the rail - filled for the newest release. */}
            <span
              aria-hidden="true"
              className={`absolute -left-[3.5px] top-3 hidden h-2 w-2 rotate-45 border sm:block ${
                latest
                  ? "border-emerald-400 bg-emerald-400"
                  : open
                    ? "border-neutral-500 bg-neutral-500"
                    : "border-neutral-600 bg-neutral-950"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {entry.title}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-neutral-400">
                {entry.summary}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-3.5 pt-2">
              {/* Counts as marks, not words: the same coloured squares label
                  the groups inside, so the newest release (open on arrival)
                  teaches what they mean. */}
              <span className="hidden items-center gap-3 sm:flex" aria-hidden="true">
                {groups.map((g) => (
                  <span
                    key={g.kind}
                    className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500"
                  >
                    <span className={`h-1.5 w-1.5 ${KIND[g.kind].mark}`} />
                    {g.items.length}
                  </span>
                ))}
              </span>
              <span className="sr-only">{counts}</span>
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`h-4 w-4 text-neutral-600 transition-transform duration-200 group-hover:text-neutral-300 motion-reduce:transition-none ${
                  open ? "rotate-180" : ""
                }`}
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </span>
          </span>
        </button>
      </h2>

      {/* 0fr -> 1fr: the panel grows to its own height with no measuring and
          no fixed max-height guess. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            id={panelId}
            inert={!open}
            className={`space-y-7 pb-9 transition-opacity duration-200 motion-reduce:transition-none sm:ml-28 sm:border-l sm:border-neutral-800 sm:pl-7 ${
              open ? "opacity-100" : "opacity-0"
            }`}
          >
            {groups.map((g) => (
              <div key={g.kind}>
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 ${KIND[g.kind].mark}`} aria-hidden="true" />
                  <span
                    className={`font-mono text-[11px] uppercase tracking-[0.16em] ${KIND[g.kind].text}`}
                  >
                    {KIND[g.kind].label}
                  </span>
                </div>
                <ul className={`ml-[3px] mt-3 space-y-3 border-l pl-4 ${KIND[g.kind].rule}`}>
                  {g.items.map((text, i) => (
                    <li key={i} className="text-sm leading-relaxed text-neutral-300">
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
