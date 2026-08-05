// The agent-ci collection: every coding agent the pipeline workflows can run,
// default first. scripts/generate-agent-steps.mjs composes these into the
// workflow templates; src/lib/agents/index.ts is the runtime twin the backend
// reads. The generator asserts the two stay in step (ids and secret names), so
// adding an agent to one without the other fails CI instead of shipping a
// half-supported agent.
import claude from "./claude.mjs";
import codex from "./codex.mjs";
import cursor from "./cursor.mjs";

export const AGENTS = [claude, codex, cursor];
export const DEFAULT_AGENT = AGENTS.find((a) => a.isDefault) ?? AGENTS[0];
export const NON_DEFAULT_AGENTS = AGENTS.filter((a) => a !== DEFAULT_AGENT);
