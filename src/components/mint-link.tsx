"use client";

import type { AgentDefinition } from "@/lib/agents";
import { CopyBox } from "@/components/wizard-ui";

// Where a credential actually comes from, rendered as the thing you act on.
//
// Its own component because three surfaces need it (Settings, the cloud
// onboarding step, Home's automatic-builds card) and because the source is
// not the same KIND of thing for each agent: a Claude Code token comes out
// of a terminal command, so that renders as a copyable box - not a link to
// the from-scratch install guide, which buried the one command the line
// above already named (owner call, 2026-08-02). Codex's key comes from a
// real web page at platform.openai.com, so that one stays a link.
//
// The credential step is where onboarding stalls most, and the reason is
// almost never that the instruction was unclear - it is that "create a key
// at platform.openai.com/api-keys" is an address to retype rather than
// something to click, and "run claude setup-token" is a command to retype
// rather than something to copy.
export function MintLink({ agent }: { agent: AgentDefinition }) {
  if (agent.credential.mintCommand) {
    return <CopyBox text={agent.credential.mintCommand} />;
  }
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
