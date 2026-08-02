"use client";

import { useFormStatus } from "react-dom";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

// The house loading state: the pixel agent already at its desk, working, with
// a "Dispatching..." label whose dots type in on a loop. Used anywhere a wait
// would otherwise freeze the screen silently.
export function Dispatching({
  label = "Dispatching",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center ${className ?? ""}`}>
      <PixelDispatcher working className="w-[168px]" />
      <TypingLabel label={label} className="mt-1 text-sm text-neutral-400" />
    </div>
  );
}

// Same idea, laid out as one short row: for a section that streams in behind
// its own <Suspense> while the rest of the page is already on screen, where
// the full-size dispatcher would be louder than the thing it's waiting for.
export function DispatchingInline({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <PixelDispatcher working className="w-[104px] shrink-0" />
      <TypingLabel label={label} className="text-xs text-neutral-500" />
    </div>
  );
}

// The label plus the three dots that type in on a loop.
function TypingLabel({ label, className }: { label: string; className?: string }) {
  return (
    <p className={`flex items-baseline font-medium ${className ?? ""}`}>
      {label}
      <span aria-hidden className="ml-0.5 inline-flex">
        <span className="dispatch-dot">.</span>
        <span className="dispatch-dot" style={{ animationDelay: "0.2s" }}>
          .
        </span>
        <span className="dispatch-dot" style={{ animationDelay: "0.4s" }}>
          .
        </span>
      </span>
    </p>
  );
}

// Drop inside any <form> whose submit runs a server action: while the action
// is in flight it covers the screen with the dispatcher instead of leaving a
// frozen, unresponsive page. useFormStatus only reports for its parent form,
// so this must live inside the form element.
export function FormPending({ label = "Dispatching" }: { label?: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/85 backdrop-blur-sm">
      <Dispatching label={label} />
    </div>
  );
}
