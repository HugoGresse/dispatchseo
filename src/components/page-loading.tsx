import type { ReactNode } from "react";
import { Dispatching } from "@/components/dispatching";

// The wrapper every dashboard route skeleton wears. The skeleton underneath
// still does its job - holding the page's shape so nothing jumps when the
// real data lands - and the dispatcher sits on top of it saying what's
// happening, the same character and the same typing dots the wizard shows
// while it waits. Grey boxes alone read as "broken"; he reads as "working".
//
// He's pinned to the first screenful rather than centred on the whole
// skeleton: the long pages (Home, Analytics) would otherwise park him below
// the fold, where a loading state is worth nothing.
//
// His tint comes from the --dispatcher-body / --dispatcher-shade variables
// the dashboard layout stamps from the active project's agent - clay for
// Claude Code, white for Codex - so these files stay plain server components
// and never have to ask which agent is on shift.
export function PageLoading({
  label = "Loading",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      <div
        role="status"
        className="pointer-events-none absolute inset-x-0 top-0 flex h-[min(60vh,22rem)] items-center justify-center"
      >
        <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/85 px-8 py-5 shadow-xl shadow-black/50 backdrop-blur-sm">
          <Dispatching label={label} />
        </div>
      </div>
    </div>
  );
}
