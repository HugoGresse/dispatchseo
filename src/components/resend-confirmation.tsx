"use client";

import { useEffect, useState, useTransition } from "react";

// "Send it again" for the check-your-inbox screen, gated behind a countdown.
//
// The wait is not decoration: Supabase rate-limits signup-confirmation sends
// per user (a window before the same address may request again) AND caps
// project-wide sends per hour. Letting someone mash the button just burns that
// budget and earns a 429, so the button opens after the cooldown and closes
// again after every attempt - including failed ones, which are usually the
// rate limit talking.

export type ResendResult = { ok: boolean; message: string };

const COOLDOWN_SECONDS = 60;

export function ResendConfirmation({ action }: { action: () => Promise<ResendResult> }) {
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_SECONDS);
  const [result, setResult] = useState<ResendResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const waiting = secondsLeft > 0;
  const disabled = waiting || pending;

  function send() {
    setResult(null);
    startTransition(async () => {
      const next = await action();
      setResult(next);
      // Re-arm either way. A failure here is nearly always "too soon".
      setSecondsLeft(COOLDOWN_SECONDS);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={send}
        disabled={disabled}
        aria-live="polite"
        className="min-h-11 w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:border-neutral-800/70 disabled:text-neutral-600 disabled:hover:border-neutral-800/70"
      >
        {pending
          ? "Sending..."
          : waiting
            ? `Send it again in ${secondsLeft}s`
            : "Send it again"}
      </button>
      {result ? (
        <p
          role="status"
          className={`text-sm ${result.ok ? "text-green-400" : "text-amber-400"}`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
