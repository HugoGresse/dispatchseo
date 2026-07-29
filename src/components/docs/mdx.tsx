import type { ReactNode } from "react";
import Link from "next/link";

// Reusable building blocks for /docs pages.
//
// HARD CONSTRAINT: next-mdx-remote v6 strips JS expressions from MDX
// (blockJS), so every prop here is a plain string and every list is passed as
// children. No `items={[...]}`, no `n={1}` - those arrive undefined. Same
// lesson the Steps component learned (src/components/blog/steps.tsx).
//
// Visual grammar matches the rest of the site: neutral-950 surface,
// neutral-800 hairlines, violet-400 accent, mono uppercase micro-labels.

/* ------------------------------------------------------------------ *
 * Callout - note / tip / warning / danger admonitions
 * ------------------------------------------------------------------ */

const CALLOUT_STYLES: Record<string, { wrap: string; icon: string; label: string; mark: ReactNode }> = {
  note: {
    wrap: "border-neutral-700/70 bg-neutral-900/50",
    icon: "bg-neutral-700/40 text-neutral-300",
    label: "text-neutral-300",
    mark: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 11v5.5M12 7.6v.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  tip: {
    wrap: "border-violet-500/30 bg-violet-500/[0.06]",
    icon: "bg-violet-500/15 text-violet-300",
    label: "text-violet-300",
    mark: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3a6 6 0 0 0-3.3 11v2.2h6.6V14A6 6 0 0 0 12 3z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M10 20h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  warning: {
    wrap: "border-amber-500/30 bg-amber-500/[0.06]",
    icon: "bg-amber-500/15 text-amber-400",
    label: "text-amber-300",
    mark: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4.5L21 19H3l9-14.5z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M12 10.5v3.4M12 16.4v.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  danger: {
    wrap: "border-red-500/30 bg-red-500/[0.06]",
    icon: "bg-red-500/15 text-red-400",
    label: "text-red-300",
    mark: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ),
  },
};

const DEFAULT_LABEL: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Careful",
  danger: "Don't do this",
};

export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: string;
  title?: string;
  children: ReactNode;
}) {
  const style = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.note;
  return (
    <div className={`my-5 flex gap-3 rounded-xl border px-4 py-3.5 ${style.wrap}`}>
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ${style.icon}`}
      >
        {style.mark}
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${style.label}`}>{title ?? DEFAULT_LABEL[type] ?? "Note"}</p>
        <div className="mt-1 text-sm leading-relaxed text-neutral-300 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cards - hub-page navigation grids
 * ------------------------------------------------------------------ */

export function CardGrid({ cols = "2", children }: { cols?: string; children: ReactNode }) {
  const grid = cols === "3" ? "sm:grid-cols-3" : cols === "1" ? "" : "sm:grid-cols-2";
  return <div className={`not-prose my-6 grid grid-cols-1 gap-4 ${grid}`}>{children}</div>;
}

export function Card({
  title,
  href,
  badge,
  children,
}: {
  title: string;
  href?: string;
  badge?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-neutral-100">{title}</span>
        {badge && (
          <span className="shrink-0 rounded border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-violet-300">
            {badge}
          </span>
        )}
      </div>
      {children && <div className="mt-1.5 text-sm leading-relaxed text-neutral-400">{children}</div>}
    </>
  );

  const shell =
    "block rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950";

  if (!href) return <div className={shell}>{body}</div>;

  const external = href.startsWith("http");
  const interactive = `${shell} hover:border-neutral-700 hover:bg-neutral-900`;

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={interactive}>
      {body}
    </a>
  ) : (
    <Link href={href} className={interactive}>
      {body}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Reference rows - env vars, MCP tool params, config keys
 * ------------------------------------------------------------------ */

export function Fields({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border border-neutral-800 divide-y divide-neutral-800">
      {children}
    </div>
  );
}

// One documented key. `name` is rendered mono because it is always something
// the reader types verbatim; `required` and `tag` are separate because a key
// can be optional AND cloud-only, and collapsing them loses that.
export function Field({
  name,
  type,
  required,
  tag,
  children,
}: {
  name: string;
  type?: string;
  required?: string;
  tag?: string;
  children: ReactNode;
}) {
  const isRequired = required === "true" || required === "yes";
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[13px] text-violet-300">
          {name}
        </code>
        {type && <span className="font-mono text-[11px] text-neutral-500">{type}</span>}
        {isRequired ? (
          <span className="rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-amber-300">
            Required
          </span>
        ) : (
          <span className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            Optional
          </span>
        )}
        {tag && (
          <span className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-400">
            {tag}
          </span>
        )}
      </div>
      <div className="mt-2 text-sm leading-relaxed text-neutral-300 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Troubleshooting entry - the symptom -> cause -> fix template
 * ------------------------------------------------------------------ */

export function Symptom({ error, children }: { error: string; children: ReactNode }) {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border border-neutral-800">
      <div className="border-b border-neutral-800 bg-neutral-900/60 px-5 py-3">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          You see
        </p>
        <p className="mt-1 font-mono text-sm text-amber-300">{error}</p>
      </div>
      <div className="px-5 py-4 text-sm leading-relaxed text-neutral-300 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small inline pieces
 * ------------------------------------------------------------------ */

// A labelled key/value strip - "Runs: every hour", "Needs: GSC connected".
export function Meta({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose my-5 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-3.5">
      {children}
    </div>
  );
}

export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-neutral-200">{children}</p>
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: string; children: ReactNode }) {
  const tones: Record<string, string> = {
    neutral: "border-neutral-700 bg-neutral-900 text-neutral-400",
    violet: "border-violet-400/30 bg-violet-500/10 text-violet-300",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  };
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 align-middle font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${
        tones[tone] ?? tones.neutral
      }`}
    >
      {children}
    </span>
  );
}
