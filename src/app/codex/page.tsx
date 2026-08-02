import type { Metadata } from "next";
import { AgentLandingPage } from "../agent-landing";

// Agent-hub page for Codex - Postiz's postiz.com/codex pattern. The shared
// shell (nav, hero, setup block, FAQ, footer) lives in ../agent-landing.tsx;
// this file only owns the route and its metadata.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DispatchSEO for Codex — SEO on Autopilot for Your Site | DispatchSEO",
  description:
    "Connect Codex to DispatchSEO over MCP: keyword research, guide writing, and pull requests on autopilot, running on your OpenAI account.",
  alternates: { canonical: "/codex" },
};

export default function CodexLandingPage() {
  return <AgentLandingPage agentId="codex" />;
}
