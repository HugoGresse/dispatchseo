"use client";

import { useActionState, useState } from "react";
import { connectBuilderToken, type ConnectBuilderTokenState } from "@/app/actions";
import { availableAgents, agentById } from "@/lib/agents";
import { AgentMark } from "@/components/agent-mark";
import { MintLink } from "@/components/mint-link";

// Home's "Turn on automatic builds" card, paste-in-place edition - the same
// connect the wizard finale uses (credential stored encrypted, fed to the
// builder container in its poll feed). Replaces the copy that sent owners back
// to the install folder to edit .env by hand - the last terminal step of the
// docker install, gone. The matching env var still overrides for scripted
// installs.
//
// The agent tabs are here, not only on Settings, because this card is where a
// self-hoster first meets the choice: the wizard's agent screen is "just read",
// and this is the moment a credential is actually needed. Storage is per agent
// (one column each), so pasting a Codex key never overwrites a Claude token -
// a stack can hold both and run different projects on each.
export function BuilderTokenConnect({ current = "claude" }: { current?: string }) {
  const agents = availableAgents();
  const [agentId, setAgentId] = useState(current);
  const agent = agentById(agentId);
  const [state, action, pending] = useActionState<ConnectBuilderTokenState, FormData>(
    connectBuilderToken,
    null,
  );
  if (state && "ok" in state) {
    return (
      <p className="mt-2 text-sm text-emerald-300">
        Saved - the builder picks it up within a few minutes, then this card disappears on its
        own.
      </p>
    );
  }
  return (
    <form action={action} className="mt-2 space-y-2">
      {agents.length > 1 ? (
        <div className="flex gap-1" role="tablist" aria-label="Coding agent">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={agentId === a.id}
              onClick={() => setAgentId(a.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                agentId === a.id
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <AgentMark id={a.id} className="h-3.5 w-3.5 shrink-0" />
              {a.displayName}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-neutral-500">{agent.credential.howToMint}</p>
      <MintLink agent={agent} />
      {state && "error" in state ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</p>
      ) : null}
      <input type="hidden" name="agent" value={agentId} />
      <input
        name="token"
        type="password"
        placeholder={agent.credential.placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60"
      />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Saving..." : "Turn on automatic builds"}
      </button>
    </form>
  );
}
