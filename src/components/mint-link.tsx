"use client";

import type { AgentDefinition } from "@/lib/agents";

// "Grab your key" - the link to where a credential actually comes from.
//
// Its own component because three surfaces need it (Settings, the cloud
// onboarding step, Home's automatic-builds card) and because the destination
// is not the same KIND of thing for each agent: Codex has a real mint page at
// platform.openai.com, while a Claude Code token comes out of a terminal
// command, so that one goes to the doc explaining the command. Hard-coding
// either would put the wrong promise on one of the two.
//
// The credential step is where onboarding stalls most, and the reason is
// almost never that the instruction was unclear - it is that "create a key at
// platform.openai.com/api-keys" is an address to retype rather than something
// to click.
export function MintLink({ agent }: { agent: AgentDefinition }) {
  const external = agent.credential.mintUrl.startsWith("http");
  return (
    <p className="text-sm text-neutral-400">
      Don&apos;t have one?{" "}
      <a
        href={agent.credential.mintUrl}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="font-medium text-violet-300 underline underline-offset-2 hover:text-violet-200"
      >
        {agent.credential.mintLinkLabel}
      </a>
      {external ? " (opens OpenAI in a new tab)" : ""}
    </p>
  );
}
