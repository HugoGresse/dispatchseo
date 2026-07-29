#!/usr/bin/env node
// The DispatchSEO CLI - the agent-agnostic door to the same state the MCP
// server serves.
//
// WHY THIS EXISTS. Every coding agent speaks MCP differently: Claude Code wants
// JSON config and `claude mcp add`, Codex wants TOML and its own subcommand,
// others want something else again, and each has its own transport quirks, auth
// handling, and project-vs-global config scoping. Supporting N agents that way
// means N adapters that all rot independently.
//
// Every coding agent can run a shell command. So this is the compatibility
// layer instead: one CLI, one env var, and a SKILL.md that any agent reads.
// Adding an agent costs nothing.
//
// WHAT IT IS NOT. It is not a second API. It is a thin client over the SAME
// /api/mcp endpoint the MCP server already exposes - JSON-RPC over HTTP with a
// bearer token. No new backend surface, no second auth path, no second tenant
// resolution, and the dashboard/MCP parity rule is inherited rather than
// re-implemented: whatever the MCP server can do, this can do, automatically.
//
// Commands are DISCOVERED from tools/list rather than hardcoded, so a new MCP
// tool becomes a new CLI command with no change here. Nothing to keep in sync.
//
// Zero dependencies on purpose: `fetch` is built into Node 20+, and a tool that
// holds a project token should be auditable in one sitting.
//
//   export DISPATCHSEO_TOKEN=...        # your project key
//   export DISPATCHSEO_URL=...          # self-host; defaults to the cloud
//   dispatchseo tools
//   dispatchseo describe propose_suggestion
//   dispatchseo get_suggestions --status approved
//   dispatchseo propose_suggestion --json '{"type":"guide","title":"..."}'

const DEFAULT_URL = "https://dispatchseo.com";

function die(msg, code = 1) {
  process.stderr.write(`dispatchseo: ${msg}\n`);
  process.exit(code);
}

const HELP = `dispatchseo - drive a DispatchSEO project from any coding agent

USAGE
  dispatchseo tools                       list every available command
  dispatchseo describe <tool>             show a command's arguments
  dispatchseo <tool> [--arg value ...]    run a command
  dispatchseo <tool> --json '<object>'    run a command with raw JSON arguments

ENVIRONMENT
  DISPATCHSEO_TOKEN   required - your project key (dashboard: Settings -> Project key)
  DISPATCHSEO_URL     optional - your backend origin, for self-hosted instances
                      (default: ${DEFAULT_URL})

NOTES
  Commands are discovered from the server, so this list reflects YOUR backend
  version. Output is JSON on stdout; errors go to stderr with a non-zero exit.
`;

// ---- MCP transport --------------------------------------------------------
// Streamable HTTP: a plain POST whose response is Server-Sent Events. The
// server answers a bare tools/call without an initialize handshake, so there is
// no session to manage - one request, one response.
async function rpc(method, params) {
  const base = (process.env.DISPATCHSEO_URL ?? DEFAULT_URL).replace(/\/+$/, "");
  const token = process.env.DISPATCHSEO_TOKEN;
  if (!token) {
    die(
      "DISPATCHSEO_TOKEN is not set.\n" +
        "  Get your project key from the dashboard (Settings -> Project key), then:\n" +
        "    export DISPATCHSEO_TOKEN=<key>",
    );
  }

  let res;
  try {
    res = await fetch(`${base}/api/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // Both, because the server answers with SSE framing.
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  } catch (e) {
    die(`could not reach ${base} - ${e.message}`);
  }

  if (res.status === 401) {
    die(
      `the server rejected your project key (401).\n` +
        `  Keys change when a project is recreated - copy the current one from the dashboard.`,
    );
  }
  if (!res.ok) die(`${base}/api/mcp returned HTTP ${res.status}`);

  const body = await res.text();
  // Pull the JSON-RPC envelope out of whichever framing came back.
  let payload = null;
  if (body.includes("data:")) {
    for (const line of body.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const parsed = JSON.parse(line.slice(5).trim());
        if (parsed.result || parsed.error) payload = parsed;
      } catch {
        /* keep-alive or partial frame - skip */
      }
    }
  } else {
    try {
      payload = JSON.parse(body);
    } catch {
      die(`could not parse the server's response:\n${body.slice(0, 400)}`);
    }
  }
  if (!payload) die(`the server returned no result:\n${body.slice(0, 400)}`);
  if (payload.error) die(payload.error.message ?? JSON.stringify(payload.error));
  return payload.result;
}

async function listTools() {
  const result = await rpc("tools/list", {});
  return result.tools ?? [];
}

// ---- argument parsing -----------------------------------------------------
// Coerced against the tool's OWN inputSchema, fetched from the server. That is
// what keeps this file free of per-tool knowledge: the server already describes
// every argument's type, so the CLI reads it rather than duplicating it.
function coerce(raw, schema) {
  const type = schema?.type;
  if (type === "number" || type === "integer") {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`expected a number, got "${raw}"`);
    return n;
  }
  if (type === "boolean") {
    if (raw === "" || raw === "true") return true;
    if (raw === "false") return false;
    throw new Error(`expected true or false, got "${raw}"`);
  }
  if (type === "array" || type === "object") {
    try {
      return JSON.parse(raw);
    } catch {
      // A convenience the schema can't express: comma-separated strings for
      // simple string arrays, since that is how a human would type them.
      if (type === "array") return raw.split(",").map((s) => s.trim()).filter(Boolean);
      throw new Error(`expected JSON, got "${raw}"`);
    }
  }
  return raw;
}

function parseArgs(argv, tool) {
  const props = tool.inputSchema?.properties ?? {};
  const known = new Set(Object.keys(props));
  const out = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--json") {
      const raw = argv[++i];
      if (raw == null) die("--json needs a JSON object");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        die(`--json is not valid JSON: ${e.message}`);
      }
      Object.assign(out, parsed);
      continue;
    }
    if (!token.startsWith("--")) die(`unexpected argument "${token}" (arguments look like --name value)`);

    const [flag, inline] = token.slice(2).split(/=(.*)/s);
    if (!known.has(flag)) {
      const hint = known.size ? `known arguments: ${[...known].join(", ")}` : "this command takes no arguments";
      die(`"${tool.name}" has no argument "${flag}".\n  ${hint}`);
    }
    // A bare boolean flag consumes no value; everything else takes the next
    // token unless it looks like the start of another flag.
    let raw = inline;
    if (raw == null) {
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) raw = argv[++i];
      else raw = "";
    }
    try {
      out[flag] = coerce(raw, props[flag]);
    } catch (e) {
      die(`--${flag}: ${e.message}`);
    }
  }
  return out;
}

// ---- output ---------------------------------------------------------------
// Tools already return pretty-printed JSON as text, so pass it through
// untouched rather than re-serialising and changing whitespace an agent may be
// matching on.
function emit(result) {
  const parts = result?.content ?? [];
  const text = parts.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  process.stdout.write(text ? `${text}\n` : `${JSON.stringify(result, null, 2)}\n`);
  // A tool that reports failure must exit non-zero, or an agent's `&&` chain
  // marches on past a step that did not happen.
  if (result?.isError) process.exit(1);
}

// ---- entry point ----------------------------------------------------------
const [command, ...rest] = process.argv.slice(2);

if (!command || command === "--help" || command === "-h" || command === "help") {
  process.stdout.write(HELP);
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  process.stdout.write("dispatchseo-cli 0.1.0\n");
  process.exit(0);
}

if (command === "tools") {
  const tools = await listTools();
  for (const t of tools.sort((a, b) => a.name.localeCompare(b.name))) {
    // First sentence only: the full descriptions are paragraphs, and this is a
    // menu, not the manual. `describe` has the detail.
    const summary = (t.description ?? "").split(/(?<=\.)\s/)[0];
    process.stdout.write(`${t.name.padEnd(28)} ${summary}\n`);
  }
  process.exit(0);
}

if (command === "describe") {
  const name = rest[0];
  if (!name) die("describe needs a command name, e.g. `dispatchseo describe propose_suggestion`");
  const tool = (await listTools()).find((t) => t.name === name);
  if (!tool) die(`no such command "${name}" - run \`dispatchseo tools\` to see what this backend offers`);
  process.stdout.write(`${tool.name}\n\n${tool.description ?? ""}\n\nARGUMENTS\n`);
  const props = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  if (!Object.keys(props).length) process.stdout.write("  (none)\n");
  for (const [key, schema] of Object.entries(props)) {
    const flags = [schema.type ?? "any", required.has(key) ? "required" : "optional"].join(", ");
    process.stdout.write(`  --${key} (${flags})\n      ${schema.description ?? "(no description)"}\n`);
    if (schema.enum) process.stdout.write(`      one of: ${schema.enum.join(", ")}\n`);
  }
  process.exit(0);
}

// Anything else is a tool name.
const tool = (await listTools()).find((t) => t.name === command);
if (!tool) {
  die(`no such command "${command}" - run \`dispatchseo tools\` to see what this backend offers`);
}
emit(await rpc("tools/call", { name: command, arguments: parseArgs(rest, tool) }));
