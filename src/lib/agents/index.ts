// The coding-agent registry - the single place that answers "which agent, and
// what does that imply".
//
// DispatchSEO drives a coding agent: it researches, writes, and opens PRs,
// while this backend is its state, schedule, and dashboard. That agent was
// Claude Code everywhere, hardcoded across the CI workflow templates, the
// docker builder, setup.sh, the connect commands, and the instructions. Adding
// a second agent means every one of those has to ask the same question in the
// same place instead of assuming an answer.
//
// This file is deliberately introduced with ONE agent registered. Nothing about
// Claude's behaviour changes: every field below returns exactly what the
// hardcoded path returned, so the seam can land and be proven byte-identical
// before a second agent exists. See docs-private/CODEX_SUPPORT_PLAN.md.
//
// CLIENT-SAFE. The onboarding wizard builds connect commands in the browser, so
// nothing here may import db.ts, github-app.ts, or any server-only module -
// same constraint mcp-connect.ts documents.

import {
  connectCommand,
  connectCommandPS,
  mcpAddCommand,
  mcpAddCommandPS,
  mcpServerName,
  setupCommand,
  setupCommandPS,
} from "@/lib/mcp-connect";

export type AgentId = "claude" | "codex";

// The default for every project that has never chosen. Also what a row reads as
// on a database that hasn't run migration 0044 yet - see projectAgent().
export const DEFAULT_AGENT: AgentId = "claude";

export type AgentDefinition = {
  id: AgentId;
  /** Shown wherever the owner picks or reviews their agent. */
  displayName: string;
  /** Where to send someone who does not have this agent installed yet. */
  installDocsPath: string;

  connect: {
    /** Per-project MCP server name, unique so two projects never shadow each other. */
    serverName: (slug: string) => string;
    /** The one paste that connects the agent in the site's repo folder. */
    bash: (slug: string, origin: string, token: string) => string;
    /** PowerShell twin - Windows terminals reject the bash chain outright. */
    powershell: (slug: string, origin: string, token: string) => string;
    /** MCP registration alone, without the gh permission pre-grant. */
    mcpAddBash: (slug: string, origin: string, token: string) => string;
    mcpAddPowershell: (slug: string, origin: string, token: string) => string;
  };

  /** The one-command installer, per shell. */
  setup: {
    bash: (slug: string, origin: string, token: string, bundled?: boolean) => string;
    powershell: (slug: string, origin: string, token: string, bundled?: boolean) => string;
  };

  credential: {
    /** The Actions secret the CI builders read. */
    repoSecretName: string;
    /** The instance_settings column the docker builder's poll feed reads. */
    instanceSettingsColumn: string;
    /** Placeholder for the paste box, so a wrong paste is obvious before it is stored. */
    placeholder: string;
    /** Cheap shape check. A real network verification happens server-side before storing. */
    looksValid: (value: string) => boolean;
    /** How the owner obtains one, in their words. */
    howToMint: string;
  };

  cost: {
    /** subscription = runs on a plan the owner already pays for; metered = billed per use. */
    model: "subscription" | "metered";
    /** One line, shown on the picker. Must stay honest about who pays. */
    note: string;
  };
};

const claude: AgentDefinition = {
  id: "claude",
  displayName: "Claude Code",
  installDocsPath: "/docs/install-claude-code",
  connect: {
    serverName: mcpServerName,
    bash: connectCommand,
    powershell: connectCommandPS,
    mcpAddBash: mcpAddCommand,
    mcpAddPowershell: mcpAddCommandPS,
  },
  setup: {
    bash: setupCommand,
    powershell: setupCommandPS,
  },
  credential: {
    repoSecretName: "CLAUDE_CODE_OAUTH_TOKEN",
    instanceSettingsColumn: "builder_claude_token",
    placeholder: "sk-ant-oat...",
    // Shape only. The prefix is the single highest-value check there is: the
    // common failure is a line-wrapped paste or the wrong text entirely, and
    // both are visible here before anything is stored.
    looksValid: (v) => v.startsWith("sk-ant-oat") && v.length > 60,
    howToMint: "Run `claude setup-token` in a terminal and copy what it prints.",
  },
  cost: {
    model: "subscription",
    note: "Runs on your existing Claude subscription - nothing extra to pay, and nothing is billed by DispatchSEO.",
  },
};

const REGISTRY: Record<AgentId, AgentDefinition | undefined> = {
  claude,
  // Codex lands here once the Phase 0 spike has answered how it actually
  // behaves - its connect syntax, config scoping, sandbox needs, and quota
  // failure text. Registering it from guessed documentation would produce
  // something that compiles, ships, and fails on the first real run.
  codex: undefined,
};

/** Every agent that can actually be selected today. */
export function availableAgents(): AgentDefinition[] {
  return (Object.keys(REGISTRY) as AgentId[])
    .map((id) => REGISTRY[id])
    .filter((a): a is AgentDefinition => a != null);
}

/**
 * The agent a project runs on, tolerant of the two ways the column can be
 * absent: a database that has not run migration 0044, and the COLS fallback
 * tier that deliberately stops selecting it. Both mean "this is a Claude
 * install", which is true - agent did not exist before Claude was the only
 * option. Callers must never read `project.agent` directly for this reason.
 */
export function projectAgent(project: { agent?: string | null } | null | undefined): AgentDefinition {
  const id = project?.agent;
  const found = id ? REGISTRY[id as AgentId] : undefined;
  return found ?? claude;
}

/** Look one up by id, falling back to the default rather than throwing. */
export function agentById(id: string | null | undefined): AgentDefinition {
  return (id ? REGISTRY[id as AgentId] : undefined) ?? claude;
}

/** Whether an id names an agent that is actually usable right now. */
export function isSupportedAgent(id: string | null | undefined): id is AgentId {
  return Boolean(id && REGISTRY[id as AgentId]);
}
