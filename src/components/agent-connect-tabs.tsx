"use client";

import { useState } from "react";
import { ShellCommandTabs } from "./shell-command-tabs";
import { CopyBox } from "./wizard-ui";
import { CopyBlock } from "./client";
import { availableAgents } from "@/lib/agents";
import { genericMcpConfig } from "@/lib/mcp-connect";

// The connect paste, for whichever agent the visitor actually uses.
//
// This is the surface that makes "works with your coding agent" true. The MCP
// server is one server and the tools are one tool set - what differs per agent
// is a single line of shell, and the honest note about what that agent can do
// here today. So: an outer tab per agent, the existing OS tabs inside it, and a
// third tab holding the raw connection details for a client nobody has written
// a command for yet (Cursor, Gemini CLI, Copilot, whatever ships next month).
//
// Commands are built HERE from plain strings rather than passed down, because
// the registry's connect entries are functions and functions do not cross the
// server/client boundary. Every module this touches is client-safe by design.
export function AgentConnectTabs({
  slug,
  origin,
  token,
  box = "wizard",
}: {
  slug: string;
  origin: string;
  token: string;
  box?: "wizard" | "card";
}) {
  const agents = availableAgents();
  const [tab, setTab] = useState<string>(agents[0]?.id ?? "claude");
  const generic = genericMcpConfig(slug, origin, token);
  const active = agents.find((a) => a.id === tab);
  const Box = box === "wizard" ? CopyBox : CopyBlock;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Coding agent">
        {[
          ...agents.map((a) => [a.id, a.displayName] as const),
          ["generic", "Other MCP client"] as const,
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === key
                ? "bg-violet-500/15 text-violet-200"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {active ? (
        <>
          {/* connect.bash, NOT connect.mcpAddBash: the full chain includes the
              gh permission pre-grant for Claude. This surface is the reconnect
              path (new machine, second dev, fresh clone with no settings file)
              and the bare MCP add used to be pasted here - leaving an agent
              that dead-stops on its first gh call, with the block unliftable
              from chat. Codex's two variants are identical by construction, so
              this change only restores what Claude's was always meant to be. */}
          <ShellCommandTabs
            bash={active.connect.bash(slug, origin, token)}
            powershell={active.connect.powershell(slug, origin, token)}
            box={box}
          />
          {/* The caveat is not fine print. An agent offered here that cannot do
              everything the other one does has to say which part, in its own
              words, at the moment someone is choosing it. */}
          {active.capabilities.caveat ? (
            <p className="text-xs text-neutral-500">{active.capabilities.caveat}</p>
          ) : null}
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-neutral-400">
            Any client that speaks streamable-HTTP MCP with a bearer token gets the same tools.
            Server name <span className="text-neutral-300">{generic.name}</span>, transport{" "}
            <span className="text-neutral-300">http</span>.
          </p>
          <Box text={generic.url} />
          <p className="text-xs text-neutral-500">and this header:</p>
          <Box text={generic.header} />
          <p className="text-xs text-neutral-500">
            If your client can&apos;t set a header, use this URL instead - same key, same access:
          </p>
          <Box text={generic.urlWithKey} />
          <p className="text-xs text-neutral-500">
            Connecting gets you every tool. The unattended overnight builder is a separate thing an
            agent has to be wired into - Claude Code and Codex both run it; anything else here
            drives DispatchSEO by hand.
          </p>
        </div>
      )}
    </div>
  );
}
