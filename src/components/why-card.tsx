"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { MascotFace } from "@/components/mascot-face";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

// "Why DispatchSEO?" mascot explainer for the public landing page.
//
// Deliberately NOT a round chat launcher: bottom-right + a circle bubble reads
// as Intercom/live-chat and baits the visitor. Instead the resting state is a
// tilted speech-note with the pixel agent peeking over its edge and a visible
// "Why DispatchSEO?" label, so it's unmistakably a mascot aside. Opening it
// pops a card whose star is the full PixelDispatcher scene, animated.
//
// ONE placement, at every width: the note sits in the hero, in normal document
// flow, and scrolls away with it. Nothing here is `position: fixed`. An aside
// that tracks the reader down the page is an interruption, not an aside - and
// on a phone it is also a fixed layer repainting over a backdrop-filtered
// sticky nav on every scrolled frame. The mascot says its piece next to the
// CTA and then gets out of the way.
//
// Because the trigger now lives near the TOP of the document, the anchored
// popover opens DOWNWARD (`top: calc(100% + 16px)`, see landing.css) - the old
// upward anchor would have flown off the top of the viewport. Below 980px the
// popover becomes a bottom sheet, which is the only thing `compact` still
// decides: modal semantics, the scrim, and the scroll lock.

// The resting tab's avatar is the shared clay face (mascot-face.tsx) - the
// same character the signup notice draws, so the two surfaces cannot drift.
const POINTS: Array<{ icon: ReactNode; lead: string; body: string }> = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    lead: "Maximize your agent.",
    body: "Claude Code or Codex is no longer just a coding agent. It's also your personal SEO manager.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
      </svg>
    ),
    lead: "It does the busywork.",
    body: "Your coding agent runs the whole SEO grind for you, so you can focus on the important things.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
    lead: "You stay in control.",
    body: "It's your agent: approve each PR, or just tell it in plain English what to change.",
  },
];

export function WhyCard() {
  const [open, setOpen] = useState(false);
  // null until the media query has been read on the client. It gates no paint -
  // it only picks the sheet-vs-popover behaviour (modal semantics, scrim,
  // scroll lock, scroll-into-view), so a null first render is harmless.
  const [compact, setCompact] = useState<boolean | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prevOpen = useRef(false);

  // Phones and tablets get the sheet treatment: a bottom sheet instead of an
  // anchored popover, which could otherwise overflow the top of a short
  // viewport. Fires only when the breakpoint is crossed, never on scroll.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 980px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Escape + click-outside to dismiss.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // Move focus into the card on open, restore to the trigger on close.
  //
  // The popover hangs off a trigger sitting near the bottom of the first
  // viewport, so opening it also scrolls it into view. `block: "nearest"` is
  // the whole point: it moves the page by the minimum needed and does nothing
  // at all when the card already fits, so it never yanks a reader who is
  // looking straight at it. The sheet is fixed to the viewport and needs none
  // of this.
  //
  // It has to wait for the entry animation to finish. scrollIntoView measures
  // the TRANSFORMED box, and the card enters at scale(0.94) translateY(-10px);
  // measuring mid-flight computes the scroll for a card ~44px shorter than the
  // one that lands, and the bottom ends up off-screen. `finished` resolves on
  // the next frame when reduced motion has already cancelled the animation.
  useEffect(() => {
    if (open) {
      closeRef.current?.focus({ preventScroll: true });
      const el = popRef.current;
      if (compact === false && el) {
        const reveal = () =>
          el.scrollIntoView({
            block: "nearest",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        const running = el.getAnimations?.() ?? [];
        if (running.length) {
          void Promise.allSettled(running.map((a) => a.finished)).then(reveal);
        } else {
          reveal();
        }
      }
    } else if (prevOpen.current) {
      triggerRef.current?.focus();
    }
    prevOpen.current = open;
  }, [open, compact]);

  // The sheet owns the screen while it's up, so the page behind it holds still.
  useEffect(() => {
    if (!open || !compact) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, compact]);

  return (
    <div ref={rootRef} className="why-hero">
      {open && compact && (
        <div className="why-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      {open && (
        <div
          ref={popRef}
          className="why-pop"
          role="dialog"
          aria-modal={compact === true}
          aria-label="Why DispatchSEO?"
        >
          <button ref={closeRef} type="button" className="why-x" onClick={() => setOpen(false)} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="why-diorama">
            <PixelDispatcher className="why-stage" working />
          </div>

          <div className="why-body">
            <h3 className="why-title">Why DispatchSEO?</h3>
            <p className="why-lead">
              It&apos;s your agent doing the SEO - the one that already knows your product.
            </p>
            <ul className="why-points">
              {POINTS.map((p) => (
                <li key={p.lead}>
                  <span className="why-ic">{p.icon}</span>
                  <span className="why-pt">
                    <b>{p.lead}</b>
                    <span className="why-pt-body">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <a className="why-cta" href="/signup">
              Start for free
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        className="why-tab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Why DispatchSEO? Open the explainer"
      >
        <MascotFace className="why-tab-face" />
        <span className="why-tab-text">
          <span className="why-tab-eyebrow">psst -</span>
          <span className="why-tab-title">Why DispatchSEO?</span>
        </span>
        <svg className="why-tab-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
