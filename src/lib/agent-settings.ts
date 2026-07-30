// Switching a project's coding agent. Server-only on purpose: the registry in
// ./agents is client-safe (the wizard builds connect commands in the browser),
// so anything touching db.ts lives here instead.
//
// One module, two callers - the dashboard's server action and the set_agent MCP
// tool - which is the parity rule in CLAUDE.md: anything the dashboard can do,
// the agent must be able to do too, and the way to guarantee that is to make
// both call the same function rather than implement it twice.

import { db } from "@/lib/db";
import { agentById, isSupportedAgent, type AgentDefinition } from "@/lib/agents";
import { hasRepoSecret } from "@/lib/github-app-secrets";
import { builderAgentToken } from "@/lib/github";
import type { Project } from "@/lib/projects";

export type AgentSwitchResult = {
  agent: AgentDefinition;
  /**
   * What the owner still has to do, in their words, or null when nothing is
   * outstanding. Never empty-but-fine: a switch that leaves the builders unable
   * to run has to say so at the moment of switching, not at 05:13 tomorrow.
   */
  todo: string | null;
  /**
   * True when the one outstanding task is "this agent has no credential where
   * the builders run". Separate from the prose because the dashboard can do
   * better than prose: it links straight to the box you paste the key into.
   * Telling someone what is wrong and making them hunt for the fix is how a
   * switch quietly becomes a broken build a day later.
   */
  needsCredential: boolean;
};

/**
 * Point a project's unattended builders at a different coding agent.
 *
 * Deliberately does NOT touch the repo. The workflow files carry both agents
 * and resolve which to run at run time from /api/project-mode, so switching is
 * a single column write and takes effect on the next scheduled run - no
 * reinstall, no PR, nothing for the owner to remember. That property is the
 * whole reason the templates resolve at run time instead of being generated
 * per agent, and it is worth protecting: if a future change makes switching
 * require a repo edit, this function is where that regression will show up.
 */
export async function setProjectAgent(
  project: Project,
  agentId: string,
): Promise<AgentSwitchResult> {
  if (!isSupportedAgent(agentId)) {
    throw new Error(
      `Unknown agent "${agentId}". Supported: claude (Claude Code), codex (Codex).`,
    );
  }
  const agent = agentById(agentId);

  const { error } = await db().from("projects").update({ agent: agentId }).eq("id", project.id);
  if (error) {
    // A database that hasn't run 0044 has no column to write. Say that, rather
    // than reporting a save that did not happen - the read path resolves the
    // missing column to Claude, so a silent failure here would look exactly
    // like "the switch didn't stick" with nothing to search for.
    if (error.message.includes("agent")) {
      throw new Error(
        "This database hasn't run migration 0044 yet, so the agent can't be changed. Apply supabase/migrations/0044_project_agent.sql and try again.",
      );
    }
    throw new Error(error.message);
  }

  const todo = await agentTodo(project, agent);
  return { agent, todo, needsCredential: todo != null };
}

/**
 * Prove a pasted credential actually works, before anything stores it.
 *
 * The two agents are not equally checkable, and pretending otherwise would be
 * worse than the asymmetry. A Claude Code OAuth token can only be validated by
 * running Claude, which does not exist on this server - so that path stays a
 * shape check, and the pack's seo-token-check workflow does the real proving
 * shortly after. An OpenAI key CAN be checked here, in one metered call costing
 * a fraction of a cent, so it is - a key that is real but sits on an account
 * with no credit passes every shape check ever written and then fails on the
 * first build at 05:13.
 */
export async function verifyAgentCredential(
  agentId: string,
  value: string,
): Promise<{ ok: true } | { error: string }> {
  const agent = agentById(agentId);
  if (!agent.credential.looksValid(value)) {
    return {
      error:
        agent.id === "claude"
          ? "That doesn't look like a Claude Code token (they start with sk-ant-oat). Run `claude setup-token` and copy its whole output."
          : "That doesn't look like an OpenAI API key (they start with sk-). Copy it again from platform.openai.com/api-keys - a key is only shown once, so a half-copied one is the usual cause.",
    };
  }
  if (agent.id !== "codex") return { ok: true };

  try {
    // A real inference call, not a models list: an unfunded account happily
    // lists models it cannot call, so a cheaper check would pass exactly the
    // key we most need to reject.
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5-mini", input: "ok", max_output_tokens: 16 }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    const code = body.error?.code ?? "";
    if (res.status === 401 || res.status === 403) {
      return {
        error:
          "OpenAI rejected that key. Copy it again from platform.openai.com/api-keys - a key is only shown once, so a half-copied one is the usual cause.",
      };
    }
    if (res.status === 429 && code === "rate_limit_exceeded") {
      // Transient, and the key is demonstrably real. Refusing to store it here
      // would send someone away to fix a problem that fixes itself.
      return { ok: true };
    }
    if (res.status === 429 || res.status === 402) {
      return {
        error: `That key is real, but the account can't run anything right now (OpenAI said: ${code || "quota exceeded"}). Add credit at platform.openai.com/settings/organization/billing, then paste it again.`,
      };
    }
    return { error: `OpenAI couldn't verify that key (HTTP ${res.status}). Try again in a moment.` };
  } catch {
    return {
      error: "Couldn't reach OpenAI to verify that key. Check your connection and try again.",
    };
  }
}

/**
 * The one thing that does NOT follow automatically from the switch: the new
 * agent's credential has to exist wherever the builders run.
 *
 * Checked rather than assumed, and phrased as a task rather than a warning,
 * because the failure it prevents is the loud-but-late kind - the workflow's
 * own preflight catches a missing secret and fails the run with a clear
 * message, which is correct behaviour but a worse moment to find out.
 */
async function agentTodo(project: Project, agent: AgentDefinition): Promise<string | null> {
  try {
    // Where the credential has to be depends on WHICH runner builds this
    // project, and the two are genuinely different places. A repo connected
    // through the GitHub App builds in Actions and needs a repo secret;
    // everything else builds in the in-stack docker container, which reads one
    // instance-wide credential per agent. Checking the wrong one would produce
    // a confident, useless instruction.
    if (project.github_installation_id) {
      if (await hasRepoSecret(project, agent.credential.repoSecretName)) return null;
      // Dashboard first, CLI second. Pasting it here runs a real check against
      // the provider before storing; `gh secret set` cannot, because GitHub
      // secrets are write-only - which is exactly how a line-wrapped key gets
      // accepted silently and only surfaces as a failed build the next morning.
      return (
        `Your builders now run ${agent.displayName}, but ${project.github_repo} has no ` +
        `${agent.credential.repoSecretName} yet - the next scheduled build will stop and say so. ` +
        `${agent.credential.howToMint} Paste it in the "${agent.displayName} credential" box on ` +
        `Settings and it gets verified before it is saved.`
      );
    }
    if (await builderAgentToken(agent.id)) return null;
    return (
      `Your builders now run ${agent.displayName}, but this instance has no ${agent.displayName} ` +
      `credential yet - builds will wait until it does. ${agent.credential.howToMint} ` +
      `Then paste it on Home's "Turn on automatic builds" card, or set ` +
      `${agent.credential.envVar} in your .env.`
    );
  } catch {
    // Couldn't check (revoked App token, API hiccup, encrypted value that won't
    // decrypt). Saying nothing beats inventing a task the owner may already
    // have done - the runner's own preflight is the backstop either way.
    return null;
  }
}
