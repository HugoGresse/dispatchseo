"use client";

import { useState } from "react";

// Presentational atoms shared by the self-host and cloud onboarding wizards.
// Extracted verbatim from onboarding-wizard.tsx so the two wizards can't
// drift on the basics while keeping their screen JSX independent.

export const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

export function CopyBox({ text, emphasis }: { text: string; emphasis?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={
        emphasis
          ? "flex items-center gap-3 rounded-xl border border-violet-500/40 bg-neutral-950 py-4 pl-5 pr-3.5 shadow-[0_0_36px_-10px_rgba(139,92,246,0.45)]"
          : "flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-950 py-2.5 pl-3.5 pr-3"
      }
    >
      <code
        className={
          emphasis
            ? "flex-1 overflow-x-auto whitespace-nowrap font-mono text-[15px] text-neutral-100 [scrollbar-width:none]"
            : "flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-neutral-300 [scrollbar-width:none]"
        }
      >
        {text}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }, () => {});
        }}
        className={
          emphasis
            ? `shrink-0 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                copied ? "bg-emerald-400 text-neutral-950" : "bg-violet-500 text-neutral-950 hover:bg-violet-400"
              }`
            : `shrink-0 cursor-pointer rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700 ${copied ? "text-emerald-400" : "text-neutral-300"}`
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function StepIcon({ children, done }: { children: React.ReactNode; done?: boolean }) {
  return (
    <div
      className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg border ${
        done
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
          : "border-violet-500/25 bg-violet-500/10 text-violet-400"
      }`}
    >
      {children}
    </div>
  );
}

export function ErrorLine({ msg }: { msg: string }) {
  return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{msg}</p>;
}

// The per-step "explain this to me" link. Every screen of both wizards has
// exactly one, in exactly the same place - directly under the intro line,
// above the card the screen asks you to fill in. The uniform position is the
// whole point: a beginner learns "help lives right there" once and stops
// hunting for it, and someone who doesn't need it learns to skip that line.
//
// It reads as a quiet invitation, not a warning: violet (the product accent,
// used everywhere for "this is a thing you can press"), never amber or red,
// which this codebase reserves for "something needs fixing".
//
// It ALWAYS opens in a new tab. The wizard persists its screen server-side,
// but a same-tab navigation still throws away everything typed into the
// current form and forces a fresh mount just to read one paragraph. Reading
// the docs must never cost the reader their place mid-setup.
export function StepHelp({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group mb-4 inline-flex max-w-full cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/70 py-1.5 pl-2 pr-3 text-sm text-neutral-400 transition-colors hover:border-violet-500/40 hover:bg-[#191521] hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/70"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-400 transition-colors group-hover:bg-violet-500/20">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1.1c0 1.7-2.4 1.9-2.4 3.4" strokeLinecap="round" />
          <path d="M12 17.1h.01" strokeLinecap="round" />
        </svg>
      </span>
      <span className="min-w-0 text-left">{label}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        className="h-3 w-3 shrink-0 text-neutral-600 transition-colors group-hover:text-violet-400"
        aria-hidden
      >
        <path d="M7 17 17 7" strokeLinecap="round" />
        <path d="M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

// The louder cousin of StepHelp, for the two screens that are real dead ends:
// both hand the reader a command to run, and both fail with `command not
// found` if the tool isn't installed - which a beginner reads as "this product
// is broken", not "I'm missing a prerequisite". So the prerequisite gets
// stated BEFORE the command, as a block that's hard to skim past, with the fix
// one click away. Still violet, still an invitation: nothing has gone wrong
// yet, which is exactly why it's worth saying up front.
//
// The left accent bar (rather than another full tinted panel) keeps it
// distinct from the "your move" / "then let the agent work" panels it shares a
// screen with, so two prominent blocks don't read as the same kind of message.
export function PrereqCallout({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: React.ReactNode;
  href: string;
  cta: string;
}) {
  return (
    // The violet tint (rather than a flat neutral surface) is what lets this
    // sit legibly both INSIDE a bg-neutral-900 card (cloud c2) and directly on
    // the page background (self-host s5) without needing a second variant.
    <div className="flex gap-3.5 rounded-xl border border-violet-500/15 border-l-2 border-l-violet-500 bg-violet-500/[0.07] px-4 py-3.5">
      <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-400">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          className="h-4 w-4"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9.5 9.5 12 7 14.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 15h4" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-neutral-100">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">{body}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-semibold text-violet-400 transition-colors hover:text-violet-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/70"
        >
          {cta}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            className="h-3 w-3 shrink-0"
            aria-hidden
          >
            <path d="M7 17 17 7" strokeLinecap="round" />
            <path d="M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
