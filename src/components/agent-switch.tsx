"use client";

import { useState, useTransition } from "react";
import { setAgent } from "@/app/actions";
import { availableAgents } from "@/lib/agents";

// Which coding agent runs this project's unattended builders.
//
// Deliberately NOT framed as "which agent do you use". Any agent connected over
// MCP drives everything interactively no matter what this says; the only thing
// it decides is who wakes up at 05:13. Conflating the two would make people
// think switching here is required before they can use Codex at all, and it
// isn't.
export function AgentSwitch({ current, slug }: { current: string; slug: string }) {
  const agents = availableAgents();
  const [selected, setSelected] = useState(current);
  const [todo, setTodo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(id: string) {
    if (id === selected || pending) return;
    const previous = selected;
    setSelected(id);
    setError(null);
    setTodo(null);
    start(async () => {
      try {
        const res = await setAgent(id, slug);
        setTodo(res.todo);
      } catch (e) {
        // Put the radio back where it was. A control that stays on the value
        // you picked after the save failed is a lie about the stored state.
        setSelected(previous);
        setError(e instanceof Error ? e.message : "Could not switch agent.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {agents.map((a) => {
          const on = selected === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => choose(a.id)}
              disabled={pending}
              aria-pressed={on}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${
                on
                  ? "border-violet-500/50 bg-violet-500/[0.08]"
                  : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-neutral-100">{a.displayName}</span>
                {on ? (
                  <span className="text-xs font-medium text-violet-300">in use</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-neutral-400">{a.cost.note}</p>
            </button>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {/* The follow-up task, when there is one. Shown here at the moment of
          switching rather than left for the builder to discover overnight -
          the run WILL stop and say so, but that is a worse place to learn it. */}
      {todo ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-sm text-amber-200/90">
          {todo}
        </p>
      ) : null}

      <p className="text-xs text-neutral-500">
        Takes effect on the next scheduled build - nothing to reinstall, because your repo&apos;s
        workflow files already carry both and ask which to use when they run. This only changes
        the unattended builders; whichever agent you connect over MCP still drives everything by
        hand.
      </p>
    </div>
  );
}
