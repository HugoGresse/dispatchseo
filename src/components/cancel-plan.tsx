"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import { cancelPlan, type CancelPlanState } from "@/app/actions";
import { CANCELLATION_REASONS, REASON_LABELS } from "@/lib/cancellation-reasons";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

// The cancel button, on the billing page, where someone looking for it will
// actually look - plus the one screen that asks why.
//
// Until this existed the only way out was a grey text link to the provider's
// hosted portal, on someone else's domain, while the landing page promised
// "cancel in one click". Making the exit hard doesn't keep customers, it just
// converts quiet churn into chargebacks and support mail.
//
// So the exit ASK follows one rule: it may never cost anyone anything to
// ignore it. Concretely -
//   - "Cancel my plan" is live from the moment the dialog opens. No field is
//     required, nothing is validated, an empty form cancels just fine.
//   - Escape, the backdrop, and an X all close it, and closing means the plan
//     is NOT cancelled - nothing is decided until the red button is pressed.
//   - One screen. No second "are you sure", no retention offer, no discount
//     ambush, no survey page after the fact.
//   - The dispatcher is here because it is the face of the product and this is
//     the last screen someone sees, not to guilt anyone into staying. The copy
//     stays matter-of-fact for the same reason.
// Anything that would break one of those rules is a dark pattern wearing a
// mascot, and belongs nowhere near this file.

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function CancelPlan({
  pending,
  endsAt,
  tierName,
  siteCount,
}: {
  /** True when a cancellation is already scheduled - flips this into the undo. */
  pending: boolean;
  /** ISO date the plan runs out. Null when the provider hasn't told us one. */
  endsAt: string | null;
  tierName: string;
  siteCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, busy] = useActionState<CancelPlanState, FormData>(cancelPlan, null);
  const endLabel = formatDate(endsAt);

  const error = state && "error" in state ? state : null;
  const errorBlock = error ? (
    <p
      role="alert"
      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm leading-relaxed text-red-300"
    >
      {error.error}{" "}
      {error.portal ? (
        <a href="/api/polar/portal" className="font-medium underline underline-offset-2">
          Open the billing portal
        </a>
      ) : null}
    </p>
  ) : null;

  // A cancellation that went through closes the dialog on its own - the page
  // behind it has already re-rendered into the "your plan ends on X" panel, so
  // leaving the form up would show someone a cancel button for a plan they
  // just cancelled. An ERROR deliberately keeps it open, with the message.
  useEffect(() => {
    if (state && "done" in state) setOpen(false);
  }, [state]);

  // Already cancelled: say so plainly, with the date and the way back.
  if (pending) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-900 bg-amber-950/30 p-5">
        {/* The word ACTIVE, in the affirmative, before anything else. Someone
            who just cancelled is the person most likely to wonder whether they
            still have what they paid for - leading with "your plan ends" answers
            the wrong question first and reads like access is already gone. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Active
          </span>
          <h3 className="font-semibold text-amber-200">
            {endLabel ? `until ${endLabel}` : "until the end of this period"}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-amber-100/70">
          Your plan is cancelled, but nothing changes before then -{" "}
          {siteCount === 1 ? "your site keeps" : "your sites keep"} running on {tierName} until the
          last day, and you won&apos;t be charged again. After that the automation stops and your
          data stays put, so picking a plan back up puts everything where you left it.
        </p>
        {errorBlock}
        <form action={formAction}>
          <input type="hidden" name="intent" value="resume" />
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Restarting..." : "Keep my plan"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      {!open ? errorBlock : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Cancel your plan</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Keeps working until the end of the period you&apos;ve paid for. No email required.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 cursor-pointer rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        >
          Cancel subscription
        </button>
      </div>
      {open ? (
        <CancelDialog
          onClose={() => setOpen(false)}
          formAction={formAction}
          busy={busy}
          errorBlock={errorBlock}
          endLabel={endLabel}
          tierName={tierName}
          siteCount={siteCount}
        />
      ) : null}
    </div>
  );
}

function CancelDialog({
  onClose,
  formAction,
  busy,
  errorBlock,
  endLabel,
  tierName,
  siteCount,
}: {
  onClose: () => void;
  formAction: (data: FormData) => void;
  busy: boolean;
  errorBlock: React.ReactNode;
  endLabel: string | null;
  tierName: string;
  siteCount: number;
}) {
  // Portalled to <body>, same reason as the add-site dialog: the dashboard
  // header uses backdrop-blur, which makes it the containing block for any
  // position:fixed descendant - rendered in place this overlay would be
  // measured against the header and clipped by it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Move focus into the dialog, onto the dialog itself rather than the first
  // field: the fields are optional, and dropping a keyboard user straight into
  // a "why are you leaving" select reads as being asked to answer it. Focusing
  // the container announces the heading and leaves the next Tab to them.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useEffect(() => panel?.focus(), [panel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop dismisses, so
        // a text selection dragged out of the textarea can't throw the form away.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={setPanel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-plan-title"
        className="relative w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl shadow-black/60 focus:outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 cursor-pointer rounded-lg px-2 py-1 text-lg leading-none text-neutral-500 transition-colors hover:text-neutral-200 disabled:opacity-40"
        >
          &times;
        </button>

        {/* `working` so it's already seated at the desk - the walk-in animation
            is for first-run screens, and making someone watch it here would be
            five seconds of whimsy in front of a thing they came to do. */}
        <PixelDispatcher working className="mx-auto mb-5 w-[min(220px,55vw)]" />

        <h2 id="cancel-plan-title" className="text-lg font-semibold text-white">
          Before you go
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
          {tierName} stays on{endLabel ? ` until ${endLabel}` : " until the end of this period"} -
          you keep what you&apos;ve paid for and you won&apos;t be charged again.
          {siteCount > 0 ? (
            <>
              {" "}
              After that, tracking and building stop for{" "}
              {siteCount === 1 ? "your site" : `your ${siteCount} sites`}. Nothing is deleted, and
              your published content and repos are untouched.
            </>
          ) : (
            // Subscribed but never added a site - there is nothing to stop, and
            // saying "your 0 sites stop" would be nonsense.
            <> Nothing is deleted, and you can pick a plan back up any time.</>
          )}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
          className="mt-5 space-y-4"
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-300">
              What made you cancel?{" "}
              <span className="font-normal text-neutral-500">Optional</span>
            </span>
            <select
              name="reason"
              defaultValue=""
              className="w-full cursor-pointer rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-violet-500/50 focus:outline-none"
            >
              <option value="">Rather not say</option>
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-300">
              Anything you&apos;d want fixed?{" "}
              <span className="font-normal text-neutral-500">Optional</span>
            </span>
            <textarea
              name="comment"
              rows={3}
              maxLength={1000}
              placeholder="Goes straight to the person who builds this. Skip it if you'd rather."
              className="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
            />
          </label>

          {errorBlock}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-50"
            >
              Never mind
            </button>
            {/* Never disabled on "no feedback given" - an empty form is a
                complete answer here. Only the in-flight submit disables it. */}
            <button
              type="submit"
              disabled={busy}
              className="cursor-pointer rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Cancelling..." : "Cancel my plan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
