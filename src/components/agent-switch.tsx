"use client";

import { useState, useTransition } from "react";
import { setAgent } from "@/app/actions";
import { availableAgents, agentById } from "@/lib/agents";
import { AgentMark } from "@/components/agent-mark";

// Which coding agent runs this project's unattended builders.
//
// Deliberately NOT framed as "which agent do you use". Any agent connected over
// MCP drives everything interactively no matter what this says; the only thing
// it decides is who runs the scheduled builds. Conflating the two would make people
// think switching here is required before they can use Codex at all, and it
// isn't.
export function AgentSwitch({ current, slug }: { current: string; slug: string }) {
  const agents = availableAgents();
  const [selected, setSelected] = useState(current);
  const [todo, setTodo] = useState<string | null>(null);
  const [needsCredential, setNeedsCredential] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selectedAgent = agentById(selected);

  function choose(id: string) {
    if (id === selected || pending) return;
    const previous = selected;
    setSelected(id);
    setError(null);
    setTodo(null);
    setNeedsCredential(false);
    start(async () => {
      try {
        const res = await setAgent(id, slug);
        setTodo(res.todo);
        setNeedsCredential(res.needsCredential);
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
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AgentMark id={a.id} className="h-[18px] w-[18px] shrink-0" />
                  <span className="font-medium text-neutral-100">{a.displayName}</span>
                </span>
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
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-sm text-amber-200/90">
          <p>
            <b className="font-semibold text-amber-200">
              {/* "credential", not "API key": Claude's is an OAuth token from
                  `claude setup-token`, and calling it an API key sends people
                  hunting for one at console.anthropic.com. */}
              Set your {selectedAgent.displayName} credential so builds actually run.
            </b>{" "}
            {todo}
          </p>
          {/* A link, not just an instruction. The credential box is on this same
              page, but "on Settings" is not findable when you are already on
              Settings and the box is two screens away. */}
          {needsCredential ? (
            <a
              href="#agent-credential"
              className="mt-2 inline-block font-medium text-amber-200 underline underline-offset-2 hover:text-amber-100"
            >
              Take me to the key box
            </a>
          ) : null}
        </div>
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
