import { AsyncLocalStorage } from "node:async_hooks";
import type { Project } from "./projects";

// Request-scoped project for the MCP tools. The auth wrapper resolves the
// bearer token to a project and runs the handler inside this store, so every
// tool callback reads currentProject() instead of threading a parameter
// through mcp-handler's registration API.
export const projectStore = new AsyncLocalStorage<Project>();

export function currentProject(): Project {
  const p = projectStore.getStore();
  if (!p) throw new Error("No project resolved for this MCP request");
  return p;
}

// WHICH KIND OF CLIENT is on the other end, resolved per request.
//
// A coding agent and a chat app want opposite things from this server. The
// agent has a large window and a shell; it should see all 63 tools and get
// pretty-printed JSON it can read. Claude.ai or ChatGPT has neither: 64 tool
// schemas is most of a $20 plan's context spent before a word is written, and
// pretty-printing costs about 40% more tokens for nothing.
//
// It rides the URL (`?client=chat`) rather than the MCP handshake, because
// this server is stateless: mcp-handler resolves each POST on its own and the
// `clientInfo` from `initialize` is not carried forward to later requests, so
// there is nothing to read it back off. The URL is on every request by
// construction, which is exactly the property needed.
//
// Absence means "agent". A missing or misspelled parameter must never cost
// someone their tools, so the default is the permissive one and this never
// throws.
export const clientKindStore = new AsyncLocalStorage<ClientKind>();

export type ClientKind = "chat" | "agent";

export function currentClientKind(): ClientKind {
  return clientKindStore.getStore() ?? "agent";
}
