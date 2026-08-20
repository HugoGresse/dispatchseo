"use client";

import { useState } from "react";
import { AgentConnectTabs } from "@/components/agent-connect-tabs";
import { CopyBlock } from "@/components/client";

// Connecting an AI to this site, for whichever AI the owner actually pays for.
//
// The split that matters here is not which brand - it is whether the AI has a
// computer. A coding agent runs in a terminal and connects with one command.
// Claude.ai and ChatGPT are apps with a settings screen, and the person using
// them has, as a rule, never opened a terminal. Two paid trials died on
// "Connect GitHub" in August 2026, so this page assumes nothing: every step
// names a thing the reader can see on their own screen, in the order they will
// see it.
//
// The `&client=chat` on the chat connector URL is load-bearing. Without it the
// server hands a chat app all 67 tools and pretty-printed answers, which spends
// most of a small plan's context before it has read a word of the site. It is
// on the URL because the server is stateless and has nowhere else to learn it.

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-semibold text-neutral-300">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-neutral-400">{children}</span>
    </li>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-violet-500/15 text-violet-200" : "text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

export type ConnectStatus = {
  /** Articles this project has taken from a chat app, and from a coding
   *  agent. Real evidence that a connection works, rather than a button the
   *  owner presses to tell us something we cannot verify. */
  fromChat: number;
  fromAgent: number;
};

export function ConnectPanels({
  slug,
  origin,
  token,
  status,
  defaultTab = "claude",
  chatSeen = false,
}: {
  slug: string;
  origin: string;
  token: string;
  status: ConnectStatus;
  // Which AI this owner said they had. The tabs stay switchable - people do
  // have both - but the one they pay for opens first.
  defaultTab?: "claude" | "agents";
  /** The chat app has reached our MCP door at least once, whether or not it
   *  has handed in an article yet. Two different facts, and the gap between
   *  them is days: "connected but nothing written" is a real state and the
   *  page should say so rather than read as "nothing works". */
  chatSeen?: boolean;
}) {
  const [tab, setTab] = useState<"claude" | "agents">(defaultTab);
  const chatUrl = `${origin}/api/mcp?key=${token}&client=chat`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Which AI">
        <Tab active={tab === "claude"} onClick={() => setTab("claude")}>
          Claude app
        </Tab>
        <Tab active={tab === "agents"} onClick={() => setTab("agents")}>
          Claude Code, Codex, Cursor
        </Tab>
      </div>

      {tab === "claude" ? (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-neutral-400">
            This is for the ordinary Claude app you already pay for, at claude.ai. Your Claude
            does the research and the writing on your own subscription; we check the article,
            format it, add links to your other pages, and publish it. Nothing to install.
          </p>

          <div className="space-y-2.5">
            <p className="text-[13px] font-medium text-neutral-300">
              1. Add the connector
            </p>
            <ol className="space-y-2">
              <Step n={1}>
                Open <b className="text-neutral-200">claude.ai</b> in a browser (not the phone
                app - the setting is only on the website).
              </Step>
              <Step n={2}>
                Click your name at the bottom left, then{" "}
                <b className="text-neutral-200">Settings</b>, then{" "}
                <b className="text-neutral-200">Connectors</b>.
              </Step>
              <Step n={3}>
                Click <b className="text-neutral-200">Add custom connector</b>. Name it
                DispatchSEO and paste this as the URL:
              </Step>
            </ol>
            <CopyBlock text={chatUrl} />
            <p className="text-[12px] leading-relaxed text-neutral-600">
              This address is a password. Anyone who has it can read and change this site&apos;s
              content plan, so do not post it anywhere.
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-[13px] font-medium text-neutral-300">2. Say hello</p>
            <p className="text-sm leading-relaxed text-neutral-400">
              Start a new chat with the connector switched on and paste this. It takes about
              five minutes and every article afterwards is better for it.
            </p>
            <CopyBlock text="Use the DispatchSEO connector and run the setup-chat workflow from get_instructions." />
            <p className="text-[12px] leading-relaxed text-neutral-500">
              Claude asks you three short questions (who buys from you, what never to say, how it
              should sound) - a sentence each is plenty. The first time it uses each DispatchSEO
              tool, claude.ai asks you to allow it; choose <b className="text-neutral-400">Always allow</b>.
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-[13px] font-medium text-neutral-300">3. Write the first one</p>
            <p className="text-sm leading-relaxed text-neutral-400">
              Once you have approved some ideas on the Queue screen:
            </p>
            <CopyBlock text="Use the DispatchSEO connector and run the write-guide-chat workflow from get_instructions. Write my next approved article." />
          </div>

          <div className="space-y-2.5">
            <p className="text-[13px] font-medium text-neutral-300">4. Put it on a schedule</p>
            <p className="text-sm leading-relaxed text-neutral-400">
              Claude can run this on its own. In a chat, click the{" "}
              <b className="text-neutral-200">+</b> and choose{" "}
              <b className="text-neutral-200">Schedule a task</b> (Pro and Max plans), set it to
              repeat weekly, and use this as the instruction:
            </p>
            <CopyBlock text="Use the DispatchSEO connector and run the write-guide-chat workflow from get_instructions. Write my next approved article and hand it in." />
            <p className="text-[12px] leading-relaxed text-neutral-600">
              One article a week is a real pace for a site being written by hand. Ours will not
              take more than five a day from anyone, whatever the schedule says.
            </p>
          </div>

          <div className="rounded-xl bg-neutral-900 px-4 py-3">
            <p className="text-[13px] text-neutral-300">
              {status.fromChat > 0
                ? `Connected. ${status.fromChat} article${status.fromChat === 1 ? "" : "s"} handed in from a chat app so far.`
                : chatSeen
                  ? "Connected - your Claude has reached us. Nothing handed in yet."
                  : "Nothing handed in from a chat app yet. This line changes on its own once your Claude submits its first article - there is no button to press."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-neutral-400">
            For an AI that runs in a terminal. One command, then it can do everything the Claude
            app can and rather more besides: it can also build interactive tools, open pull
            requests, and run unattended on a schedule.
          </p>
          <AgentConnectTabs slug={slug} origin={origin} token={token} box="card" />
          <div className="rounded-xl bg-neutral-900 px-4 py-3">
            <p className="text-[13px] text-neutral-300">
              {status.fromAgent > 0
                ? `${status.fromAgent} article${status.fromAgent === 1 ? "" : "s"} handed in from a coding agent so far.`
                : "No articles handed in from a coding agent yet."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
