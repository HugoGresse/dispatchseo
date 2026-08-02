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
// self-hoster's PICK (made on the wizard's agent step) first needs a
// credential to back it. Storage is per agent
// (one column each), so pasting a Codex key never overwrites a Claude token -
// a stack can hold both and run different projects on each.
//
// `connected` (optional, per agent id) lets a caller that KNOWS what's stored
// - Settings reads the instance row server-side - render "already saved,
// paste to replace" instead of a first-time ask. The first-run surfaces (Home
// card, wizard) omit it, because there a key genuinely doesn't exist yet.
export function BuilderTokenConnect({
  current = "claude",
  connected = {},
  // Home's card is literally the "turn on automatic builds" moment; Settings
  // embeds this same box under its Coding agent section, where that label
  // would claim a bigger act than storing a key.
  cta = "Turn on automatic builds",
}: {
  current?: string;
  /**
   * Per agent id. Self-host callers only ever produce true/false (the
   * instance row is readable truth); "unknown" is accepted for type
   * compatibility with the shared Settings map and treated as not-stored.
   */
  connected?: Record<string, boolean | "unknown">;
  cta?: string;
}) {
  const agents = availableAgents();
  const [agentId, setAgentId] = useState(agentById(current).id);

  return (
    <div className="mt-2 space-y-2">
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
              {/* Green check = this agent's key is stored on this instance -
                  legible from the tab bar without opening each tab. */}
              {connected[a.id] === true ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="h-3 w-3 shrink-0 text-emerald-400"
                  aria-label="key stored"
                >
                  <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {/* Keyed so switching tabs resets the form's action state and the
          replace-reveal - a success note or an opened form from one agent's
          tab must not linger under the other's. */}
      <BuilderTokenForm
        key={agentId}
        agentId={agentId}
        connected={connected[agentId] === true}
        cta={cta}
      />
    </div>
  );
}

function BuilderTokenForm({
  agentId,
  connected,
  cta,
}: {
  agentId: string;
  connected: boolean;
  cta: string;
}) {
  const agent = agentById(agentId);
  const [state, action, pending] = useActionState<ConnectBuilderTokenState, FormData>(
    connectBuilderToken,
    null,
  );
  // A stored credential keeps the paste form tucked away until the owner
  // actually wants to replace it - nothing to do on the happy path, and a
  // bare input box under a saved key reads as "you still owe us this".
  const [replacing, setReplacing] = useState(false);
  const showForm = !connected || replacing;

  if (state && "ok" in state) {
    return (
      <>
        <p className="mt-2 text-sm text-emerald-300">
          Saved - the builder picks it up within a few minutes.
          {/* Only claim the repo sync when it verifiably happened - the sync is
              best-effort, and implying a secret exists that doesn't is how the
              9-second workflow failure this feature fixes came about. */}
          {state.syncedRepos && state.syncedRepos.length > 0 ? (
            <>
              {" "}Also stored on{" "}
              <b className="font-medium">{state.syncedRepos.join(", ")}</b> as a repo secret, so
              GitHub-scheduled runs read it too.
            </>
          ) : null}
        </p>
        {/* The other half of that honesty. When the repo sync was ATTEMPTED and
            every repo refused, silence reads as "all good" while the repo's
            scheduled workflows keep dying seconds in on the missing secret -
            the exact failure the sync exists to prevent. Amber, not red: the
            credential really was stored, so this is a caveat, not an error. */}
        {state.syncCaveat ? (
          <p className="mt-1.5 text-sm text-amber-300/90">{state.syncCaveat}</p>
        ) : null}
      </>
    );
  }
  return (
    <div className="space-y-2">
      {connected ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2.5 text-sm text-emerald-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden>
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <b className="font-semibold">A {agent.displayName} credential is already saved</b>
            {" - the builder uses it on every run. Nothing to do here unless it expired or was " +
              "revoked."}
          </span>
        </div>
      ) : null}

      {connected && !replacing ? (
        <button
          type="button"
          onClick={() => setReplacing(true)}
          className="cursor-pointer text-sm font-medium text-neutral-400 underline underline-offset-2 transition-colors hover:text-neutral-200"
        >
          Paste a new key to replace it
        </button>
      ) : null}

      {showForm ? (
        <form action={action} className="space-y-2">
          <p className="text-xs text-neutral-500">{agent.credential.howToMint}</p>
          <MintLink agent={agent} />
          {state && "error" in state ? (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</p>
          ) : null}
          <input type="hidden" name="agent" value={agent.id} />
          <input
            name="token"
            type="password"
            placeholder={connected ? "Paste a new one to replace it" : agent.credential.placeholder}
            autoComplete="off"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60"
          />
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Saving..." : connected ? "Replace it" : cta}
          </button>
        </form>
      ) : null}
    </div>
  );
}
