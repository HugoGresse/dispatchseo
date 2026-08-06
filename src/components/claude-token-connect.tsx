"use client";

import { useState } from "react";
import { useActionState } from "react";
import { connectClaudeToken, type ConnectClaudeState } from "@/app/actions";
import { CopyBox, ErrorLine, inputClass } from "@/components/wizard-ui";
import { builderAgents, agentById } from "@/lib/agents";
import { AgentMark } from "@/components/agent-mark";
import { MintLink } from "@/components/mint-link";

// Cloud Settings: store or rotate a builder credential repo secret through the
// GitHub App. One tab per agent, because each agent's key lands in its own
// repo secret and the box has to say WHICH one it is storing - a Codex key
// pasted into a form labeled Claude would pass the shape gate of neither.
// `connected` is per agent for the same reason: "a credential is stored" is
// only an honest statement about the tab being looked at.
//
// Storing a key for an agent the project isn't on yet is "adding" that agent,
// not switching to it - the form sends reconcile=0 so connectClaudeToken
// skips its wizard-flow agent reconcile. Switching stays where it belongs:
// the cards above this box, and the header switcher.
//
// Everything agent-specific - the secret name, the placeholder, how to obtain
// one, whether there is a command to run first - comes from the registry, so
// this component never learns a second agent's details.
export function ClaudeTokenConnect({
  agent: initialAgent = "claude",
  connected = {},
  // Which project's repo the secret lands on. Required: connectClaudeToken
  // takes the target explicitly rather than resolving it from the active
  // project, precisely so a credential can't be written into a repo the owner
  // didn't choose - which means every caller has to name it, this one included.
  slug,
}: {
  agent?: string;
  /**
   * Per agent id - whether a secret with that agent's name exists on the
   * repo. "unknown" means the question couldn't be asked (App unreachable);
   * the box then says "already pasted it? can't tell from here" instead of
   * presenting a stored key as missing.
   */
  connected?: Record<string, boolean | "unknown">;
  slug: string;
}) {
  const agents = builderAgents();
  const [agentId, setAgentId] = useState(agentById(initialAgent).id);

  return (
    <div className="space-y-3">
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
              {/* Green check = a key for this agent is verifiably stored, so
                  "which agents are set up" reads off the tab bar without
                  opening each tab. Only for true - "unknown" must not claim. */}
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
      {/* Keyed so switching tabs resets the form's action state - a "stored on
          your repo" success note from the Codex tab must not linger under the
          Claude one. */}
      <AgentTokenForm
        key={agentId}
        agentId={agentId}
        connected={connected[agentId] ?? false}
        slug={slug}
      />
    </div>
  );
}

function AgentTokenForm({
  agentId,
  connected,
  slug,
}: {
  agentId: string;
  connected: boolean | "unknown";
  slug: string;
}) {
  const agent = agentById(agentId);
  const [state, action, pending] = useActionState<ConnectClaudeState, FormData>(
    connectClaudeToken,
    null,
  );
  // When a token is already stored, keep the rotation form tucked away until
  // the owner actually wants to replace it - nothing to do on the happy path.
  const [rotating, setRotating] = useState(false);
  const showForm = connected !== true || rotating;

  return (
    <div className="space-y-3">
      {connected === true ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2.5 text-sm text-emerald-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden>
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {/* "Stored", not "working". A repo secret is write-only - nothing
              here can read the value back, so a truncated or line-wrapped paste
              looks identical to a good one from this side. Claiming it works
              is how someone learns their key was mangled from a failed build
              the next morning instead of from this box. */}
          {/* The separator is written as an explicit string, not as loose JSX
              text after </b>: written the other way the leading space is eaten
              and it renders "stored- as a secret". */}
          <span>
            <b className="font-semibold">A {agent.displayName} credential is stored</b>
            {" - as a secret on your repo. Its value can't be read back from here, so the next " +
              "build is what proves it works; if one fails on the credential, paste it again below."}
          </span>
        </div>
      ) : connected === "unknown" ? (
        // Can't ask GitHub right now (or repo secrets are simply write-only
        // territory from here). Say that instead of implying nothing is
        // stored - the most likely reader already pasted a key and is
        // wondering whether it took.
        <p className="text-sm leading-relaxed text-neutral-400">
          <b className="font-medium text-neutral-200">Already pasted it? It&apos;s likely still
          there.</b>{" "}
          This box can&apos;t read your repo&apos;s secrets from here, so it can&apos;t show
          what&apos;s stored - pasting again simply replaces it. {agent.credential.howToMint}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-neutral-400">
          {agent.cost.note} {agent.credential.howToMint} It&apos;s stored as a secret on your
          repo, never on our side:
        </p>
      )}

      {/* Where to GET one, as a link rather than an address to retype. Shown
          whether or not a credential is already stored, because the other time
          you need this page is when the stored one stopped working. */}
      <MintLink agent={agent} />

      {state && "error" in state ? <ErrorLine msg={state.error} /> : null}
      {state && "ok" in state ? (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Stored on your repo as {agent.credential.repoSecretName}. The next scheduled run uses
          it; anything wrong shows up on the Home banner.
        </p>
      ) : null}

      {connected === true && !rotating ? (
        <button
          type="button"
          onClick={() => setRotating(true)}
          className="cursor-pointer text-sm font-medium text-neutral-400 underline underline-offset-2 transition-colors hover:text-neutral-200"
        >
          Rotate the token
        </button>
      ) : null}

      {showForm ? (
        <div className="space-y-3">
          {/* Only agents whose credential is minted by a terminal command get
              a copy box; a key created in a browser would make it a dead end. */}
          {agent.credential.mintCommand ? <CopyBox text={agent.credential.mintCommand} /> : null}
          <form action={action} className="flex gap-2.5">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="agent" value={agent.id} />
            <input type="hidden" name="reconcile" value="0" />
            <input
              type="password"
              name="token"
              required
              // "new-password", not "off": Chrome ignores off on password
              // fields and prefills a saved login here, which reads as "just
              // press Enter" and submits somebody's Google password as an
              // agent credential (observed on the cloud wizard, 2026-08-06).
              autoComplete="new-password"
              placeholder={
                connected ? "Paste a new one to replace it" : agent.credential.placeholder
              }
              className={`${inputClass} font-mono text-sm`}
            />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Storing..." : connected ? "Replace it" : "Store it"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
