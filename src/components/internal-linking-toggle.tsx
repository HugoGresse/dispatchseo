"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInternalLinking } from "@/app/actions";

// The on/off switch for internal back-linking. Same optimistic mechanics as
// AutomationToggle, but a separate component on purpose: this is not an
// automation flag, it is permission for the builder to edit pages the owner
// already published, and it must never ride along with a Semi/Auto preset.
//
// On a failed write we snap back AND surface the message - unlike an automation
// flag, "did this actually save?" matters here, because the answer decides
// whether an agent may touch live content.
export function InternalLinkingToggle({ enabled, slug }: { enabled: boolean; slug: string }) {
  const [, startTransition] = useTransition();
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setOn(enabled);
  }, [enabled]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Let the builder add links from older posts"
        onClick={() => {
          const next = !on;
          setOn(next);
          setError(null);
          startTransition(async () => {
            try {
              await setInternalLinking(next, slug);
              router.refresh();
            } catch (e) {
              setOn(!next);
              setError(e instanceof Error ? e.message : "Could not save that.");
            }
          });
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          on ? "bg-violet-500" : "bg-neutral-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            on ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
      {error ? <p className="max-w-xs text-right text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
