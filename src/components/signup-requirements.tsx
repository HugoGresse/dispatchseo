"use client";

import { useState } from "react";
import Link from "next/link";
import { MascotFace } from "@/components/mascot-face";

// The Dispatcher's aside on the signup form: what a site needs before any of
// this can work, said BEFORE an account exists and long before a card does.
//
// Open at rest, dismissible. It spent a week collapsed behind an "Open the
// message" tab (b823712), and on 2026-08-07 a WordPress site owner walked
// straight past that tab, started a trial, hit the Connect GitHub screen and
// cancelled within five minutes with reason "unused". A gate this decisive
// doesn't get to wait behind a click; the Hide button is for people who've
// read it.
//
// Why it lives here and not in AuthShell: the shell is shared with /login, and
// a person signing back in has already been through setup. The notice belongs
// on the one screen where someone is about to start.
//
// Why it is static copy rather than a per-domain check: the signup page never
// asks for a domain. `?domain=` only arrives when the visitor used the landing
// hero's box, and the field on this page is a hidden input carrying that value
// (see signup/page.tsx) - so a person who clicked "Start for free" reaches
// checkout without ever naming their site. A stack sniffer would have nothing
// to sniff for exactly the people who most need telling. This is the honest
// version: state the requirement, name the platforms it rules out, link the
// long form.
//
// Amber, not red, on the same reasoning as the "address already has an
// account" notice below it: the reader has done nothing wrong. They are being
// handed a fact early enough to act on it.
//
// The requirement list is deliberately BOTH hard gates, not just the repo one.
// The wizard refuses to finish without a repo (pipeline-install.ts) AND
// without a coding agent token (screen c2 has no skip). Naming one and hiding
// the other just moves the surprise one screen later.

// The bubble's tail, shared by the resting tab and the opened panel so the
// mascot keeps speaking from the same spot when it expands. Only the two edges
// facing the face keep their border, so it reads as the outline continuing
// rather than a diamond parked next to it.
function Tail() {
  return (
    <span
      aria-hidden="true"
      className="absolute -left-[5px] top-4 h-2.5 w-2.5 rotate-45 border-b border-l border-amber-500/25 bg-amber-500/10"
    />
  );
}

// Labelled "Important", not "psst". The mascot supplies the character; this
// line has to supply the weight, because the message it gates is the one that
// decides whether the reader can use the product at all.
function Eyebrow() {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-amber-300/90">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4.5M12 16h.01" />
      </svg>
      Important
    </span>
  );
}

export function SignupRequirements() {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex items-start gap-2.5">
      <MascotFace className="mt-1.5 h-8 w-[42px] shrink-0" />
      {open ? (
        <div className="relative rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3">
          <Tail />
          <Eyebrow />
          <p className="mt-1 text-[13px] leading-relaxed text-amber-200/90">
            Your site needs to live in a GitHub repo, and you&apos;ll need a coding agent - Claude
            Code, Codex, or Cursor. WordPress, Wix, Squarespace and Shopify don&apos;t work yet.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href="/docs/setup-wizard"
              className="text-[13px] font-medium text-amber-200 underline underline-offset-2 hover:text-white"
            >
              See what you need
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer text-[13px] font-medium text-amber-200/60 transition-colors hover:text-amber-200"
            >
              Hide
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="group relative flex cursor-pointer items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 py-2 pl-3.5 pr-3 text-left transition-colors hover:border-amber-500/40 hover:bg-amber-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          <Tail />
          <span>
            <Eyebrow />
            <span className="block text-[13px] font-medium text-amber-200/90">
              Open the message
            </span>
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-amber-300/60 transition-transform group-hover:translate-x-0.5"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
