"use client";

import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { agentById } from "@/lib/agents";

// A per-agent tabbed block for docs that show the same instruction once per
// coding agent (a connect command, an upgrade prompt, ...). Replaces the old
// "**Claude Code:** <block> / **Codex:** <block>" interleaved-prose pattern
// so a third agent slots in as one more <AgentTab>, not a paragraph rewrite.
//
// HARD CONSTRAINT (see src/components/docs/mdx.tsx): next-mdx-remote v6
// strips JS expressions from MDX, so `id` must be a plain string prop - no
// arrays, no computed values. AgentTabs reads structure off its children
// instead of taking a data prop.
//
// Interactive by the same pattern as CopyablePre (src/components/blog/CopyablePre.tsx):
// a "use client" component with local useState, registered in the MDX
// component map and dropped into otherwise-static server-rendered docs pages.

export function AgentTab({ children }: { id: string; children: ReactNode }) {
  // AgentTabs reads `id` and `children` straight off each element - this
  // component only exists so MDX has something to write <AgentTab id="..."> as.
  return <>{children}</>;
}

type AgentTabElement = ReactElement<{ id: string; children: ReactNode }>;

function isAgentTab(node: ReactNode): node is AgentTabElement {
  return isValidElement(node) && typeof (node.props as { id?: unknown }).id === "string";
}

export function AgentTabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children).filter(isAgentTab);
  const [active, setActive] = useState(0);

  if (tabs.length === 0) return null;
  const current = tabs[active] ?? tabs[0];

  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border border-neutral-800">
      <div className="flex flex-wrap gap-1 border-b border-neutral-800 bg-neutral-900/60 px-2 pt-2">
        {tabs.map((tab, i) => {
          const label = agentById(tab.props.id).displayName;
          const isActive = i === active;
          return (
            <button
              key={tab.props.id}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={isActive}
              className={`rounded-t-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${
                isActive
                  ? "border border-b-0 border-neutral-800 bg-neutral-950 text-violet-300"
                  : "translate-y-px text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="px-5 py-4 text-sm leading-relaxed text-neutral-300 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {current}
      </div>
    </div>
  );
}
