"use client";

import { useState } from "react";
import { useActionState } from "react";
import { connectClaudeToken, type ConnectClaudeState } from "@/app/actions";
import { CopyBox, ErrorLine, inputClass } from "@/components/wizard-ui";
import { agentById } from "@/lib/agents";
import { MintLink } from "@/components/mint-link";

// Cloud Settings: rotate or re-store the builder credential repo secret through
// the GitHub App - the permanent home of the wizard's c2 paste, for when the
// credential expires or was revoked. `connected` reflects whether one is
// already stored on the repo, so an already-set-up owner sees "you're done,
// this is only for rotating" instead of a box that looks like a required redo.
//
// Everything agent-specific - the secret name, the placeholder, how to obtain
// one, whether there is a command to run first - comes from the registry, so
// this component never learns a second agent's details.
export function ClaudeTokenConnect({
  agent: agentId = "claude",
  connected,
  // Which project's repo the secret lands on. Required: connectClaudeToken
  // takes the target explicitly rather than resolving it from the active
  // project, precisely so a credential can't be written into a repo the owner
  // didn't choose - which means every caller has to name it, this one included.
  slug,
}: {
  agent?: string;
  connected?: boolean;
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
  const showForm = !connected || rotating;

  return (
    <div className="space-y-3">
      {connected ? (
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
      ) : (
        <p className="text-sm leading-relaxed text-neutral-400">
          {agent.cost.note} {agent.credential.howToMint} It&apos;s stored as a secret on your repo,
          never on our side:
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

      {connected && !rotating ? (
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
          {/* Only Claude has a command to run first; an OpenAI key is created
              in a browser, so a copy box here would be a dead end. */}
          {agent.id === "claude" ? <CopyBox text="claude setup-token" /> : null}
          <form action={action} className="flex gap-2.5">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="agent" value={agent.id} />
            <input
              type="password"
              name="token"
              required
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
