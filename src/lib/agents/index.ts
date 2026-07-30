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
// It landed with ONE agent registered so the seam could be proven
// byte-identical to the hardcoded path before a second agent existed. Codex is
// now the second, and that guarantee did not lapse: scripts/agent-golden.mjs
// still diffs every Claude string on every push, and the Claude block of
// test/golden/agent-commands.json is unchanged since the day it was written.
// See docs-private/CODEX_SUPPORT_PLAN.md.
//
// Adding a third agent is one object in this file - plus its golden entry, so a
// later refactor cannot quietly rewrite a command someone pastes into a
// terminal. docs/AGENTS.md is the contributor-facing version of that bar.
//
// CLIENT-SAFE. The onboarding wizard builds connect commands in the browser, so
// nothing here may import db.ts, github-app.ts, or any server-only module -
// same constraint mcp-connect.ts documents.

import {
  codexConnectCommand,
  codexConnectCommandPS,
  codexMcpAddCommand,
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
  /** The executable on PATH. setup.sh checks for it; the docs name it. */
  cli: string;
  /** Where to send someone who does not have this agent installed yet. */
  installDocsPath: string;
  /** Where the vendor's own install instructions live. */
  installUrl: string;

  /**
   * What this agent can actually do here TODAY, not what it will do when the
   * next phase lands. Every surface that offers the agent reads this rather
   * than assuming parity, because a capability that is offered and silently
   * absent is the worst failure this product has - see the no-silent-failures
   * rule. A false here must be visible in the UI, in the agent's own words.
   */
  capabilities: {
    /** Connects over MCP: full dashboard-parity tool set, interactive workflows. */
    mcp: boolean;
    /** Runs the unattended builders (GitHub Actions / the docker builder). */
    headlessBuilder: boolean;
    /** One line naming whatever is false above. Empty when everything is true. */
    caveat: string;
  };

  /** Starts an interactive session already holding a prompt. */
  launch: (prompt: string) => string;

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
    /**
     * The process env var the docker stack can supply instead of the stored
     * value. Spelled the same as repoSecretName for both agents today, but kept
     * separate on purpose: they answer different questions (what GitHub calls
     * it vs what the container reads), and collapsing them would make a future
     * divergence a silent wrong-credential bug rather than a type error.
     */
    envVar: string;
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
  cli: "claude",
  installDocsPath: "/docs/install-claude-code",
  installUrl: "https://claude.com/claude-code",
  capabilities: {
    mcp: true,
    headlessBuilder: true,
    caveat: "",
  },
  launch: (prompt) => `claude "${prompt}"`,
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
    envVar: "CLAUDE_CODE_OAUTH_TOKEN",
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

// Codex. Every field below is measured against codex-cli 0.146.0 rather than
// read off documentation - the connect syntax, the absence of a scope flag, the
// fact that re-adding overwrites instead of erroring, and the tool count that
// actually arrives (all of them, nothing dropped by its schema validator). See
// docs-private/CODEX_FACTS.md for the runs behind each one.
const codex: AgentDefinition = {
  id: "codex",
  displayName: "Codex",
  cli: "codex",
  installDocsPath: "/docs/install-codex",
  installUrl: "https://developers.openai.com/codex/cli",
  capabilities: {
    mcp: true,
    // True since 2026-07-30. Every seo-* workflow template now carries both
    // agents and resolves which to run from the dashboard at run time, and the
    // docker builder takes the agent per JOB off its poll feed. What made this
    // safe to flip was not the wiring but the classifier: Codex collapses every
    // 429 into one message, so a text-matching classifier would have read an
    // unfunded account as a quiet deferral and reported green forever while
    // building nothing. Both runners now ask OpenAI for error.code instead.
    headlessBuilder: true,
    caveat: "",
  },
  launch: (prompt) => `codex "${prompt}"`,
  connect: {
    serverName: mcpServerName,
    bash: codexConnectCommand,
    // Same string. Codex's connect has no header to quote and nothing to chain,
    // so the paste that works in bash works unchanged in PowerShell - which is
    // the reason the URL-key form was chosen over --bearer-token-env-var.
    powershell: codexConnectCommandPS,
    mcpAddBash: codexMcpAddCommand,
    mcpAddPowershell: codexMcpAddCommand,
  },
  setup: {
    bash: (slug, origin, token, bundled) => setupCommand(slug, origin, token, bundled, "codex"),
    powershell: (slug, origin, token, bundled) =>
      setupCommandPS(slug, origin, token, bundled, "codex"),
  },
  credential: {
    repoSecretName: "OPENAI_API_KEY",
    envVar: "OPENAI_API_KEY",
    instanceSettingsColumn: "builder_openai_key",
    placeholder: "sk-...",
    // Shape only, and deliberately loose: OpenAI ships several prefixes
    // (sk-proj-, sk-svcacct-, plain sk-) and adds more. Rejecting a real key
    // because the prefix list went stale is worse than letting the real network
    // check downstream be the one that says no.
    looksValid: (v) => v.startsWith("sk-") && v.length > 20,
    howToMint:
      "Create a key at platform.openai.com/api-keys. A project key is fine; it must belong to an account with credit on it.",
  },
  cost: {
    model: "metered",
    note: "Runs on your own OpenAI API key - OpenAI bills you per run, and nothing is billed by DispatchSEO.",
  },
};

const REGISTRY: Record<AgentId, AgentDefinition | undefined> = {
  claude,
  codex,
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
