// Agent-portability gate for the MCP tool surface.
//
// Claude Code is forgiving about tool schemas; OpenAI's function-calling
// validator (which Codex feeds every MCP tool through) is not. A single
// rejected schema does not degrade one tool - it can make the whole server
// fail to register, which reads downstream as "the agent saw no tools and
// exited cleanly": a green run that built nothing. That is the exact failure
// class the seo-daily preflight already guards against for an unreachable
// MCP, and this is its schema-shaped twin.
//
// Run:
//   node --env-file=.env.local scripts/mcp-schema-check.mjs [base-url]
//
// Read-only: it calls tools/list and nothing else, so it is safe against
// production. Exits non-zero on any ERROR, so CI can gate on it.
//
// Severities:
//   ERROR - a real portability break; fix before claiming another agent works
//   WARN  - fine today, but violates OpenAI strict-mode rules or risks
//           silent truncation. Worth knowing, does not fail the run.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:3000";
const token = process.env.MCP_API_KEY;
if (!token) {
  console.error("Missing MCP_API_KEY in the environment (.env.local).");
  process.exit(1);
}

// OpenAI accepts only this set of string formats; anything else is either
// ignored or rejected depending on the endpoint, and "depending on" is not a
// property we want in the pipeline.
const ALLOWED_FORMATS = new Set([
  "date-time", "time", "date", "duration", "email", "hostname",
  "ipv4", "ipv6", "uuid",
]);

// Keywords OpenAI's structured-output validator rejects outright in strict
// mode. Combinators are listed separately because they are only a hard break
// at the schema root.
const STRICT_UNSUPPORTED = [
  "not", "if", "then", "else", "patternProperties", "dependencies",
  "dependentSchemas", "dependentRequired", "propertyNames", "contains",
  "unevaluatedProperties", "unevaluatedItems", "$ref", "$defs", "definitions",
];
const COMBINATORS = ["oneOf", "anyOf", "allOf"];

const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_DEPTH = 5; // OpenAI strict-mode nesting ceiling
const MAX_PROPS = 100; // OpenAI strict-mode property ceiling per schema

const findings = [];
function report(sev, tool, msg) {
  findings.push({ sev, tool, msg });
}

// Walk a schema, collecting depth and property count as it goes.
function walk(node, tool, path, depth, stats) {
  if (!node || typeof node !== "object") return;
  stats.maxDepth = Math.max(stats.maxDepth, depth);

  for (const kw of STRICT_UNSUPPORTED) {
    if (kw in node) {
      report("WARN", tool, `${path || "<root>"}: uses "${kw}" - rejected by OpenAI strict mode`);
    }
  }
  for (const kw of COMBINATORS) {
    if (kw in node) {
      const sev = path === "" ? "ERROR" : "WARN";
      report(sev, tool, `${path || "<root>"}: uses "${kw}"${path === "" ? " at the schema ROOT - not a valid function parameter schema" : " - rejected by OpenAI strict mode"}`);
    }
  }
  if (typeof node.format === "string" && !ALLOWED_FORMATS.has(node.format)) {
    report("WARN", tool, `${path}: format "${node.format}" is outside the set OpenAI recognises`);
  }
  if (Array.isArray(node.enum) && node.enum.length > 60) {
    report("WARN", tool, `${path}: enum has ${node.enum.length} values - large enums bloat every request`);
  }
  if (Array.isArray(node.type)) {
    report("WARN", tool, `${path}: union type [${node.type.join(", ")}] - not portable; pick one type`);
  }

  if (node.type === "object" || node.properties) {
    const props = node.properties ?? {};
    const keys = Object.keys(props);
    stats.propCount += keys.length;
    if (keys.length > MAX_PROPS) {
      report("WARN", tool, `${path || "<root>"}: ${keys.length} properties exceeds OpenAI's ${MAX_PROPS} ceiling`);
    }
    for (const k of keys) {
      const child = props[k];
      const childPath = path ? `${path}.${k}` : k;
      if (!child || typeof child !== "object") {
        report("ERROR", tool, `${childPath}: property schema is not an object`);
        continue;
      }
      if (typeof child.description !== "string" || child.description.trim() === "") {
        report("WARN", tool, `${childPath}: no description - the agent has to guess what to pass`);
      }
      walk(child, tool, childPath, depth + 1, stats);
    }
  }
  if (node.items) walk(node.items, tool, `${path}[]`, depth + 1, stats);
}

const transport = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "mcp-schema-check", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = new Set();
let totalSchemaBytes = 0;

for (const t of tools) {
  const stats = { maxDepth: 0, propCount: 0 };

  if (!TOOL_NAME_RE.test(t.name)) {
    report("ERROR", t.name, `name fails ^[a-zA-Z0-9_-]{1,64}$ - unusable as an OpenAI function name`);
  }
  // Codex namespaces MCP tools as <server>__<tool>; a long server name plus a
  // long tool name can cross the 64-char function-name ceiling on the way in.
  if (t.name.length > 40) {
    report("WARN", t.name, `name is ${t.name.length} chars - server-prefixed it may approach the 64-char function-name limit`);
  }
  if (names.has(t.name)) report("ERROR", t.name, "duplicate tool name");
  names.add(t.name);

  if (typeof t.description !== "string" || t.description.trim() === "") {
    report("ERROR", t.name, "no description - the agent cannot know when to call it");
  }

  const s = t.inputSchema;
  if (!s || typeof s !== "object") {
    report("ERROR", t.name, "inputSchema missing or not an object");
    continue;
  }
  if (s.type !== "object") {
    report("ERROR", t.name, `inputSchema root type is "${s.type ?? "undefined"}" - OpenAI requires "object"`);
  }
  if (!s.properties) {
    report("WARN", t.name, "inputSchema has no properties key - emit {} for a no-arg tool");
  }

  totalSchemaBytes += JSON.stringify({ name: t.name, description: t.description, inputSchema: s }).length;
  walk(s, t.name, "", 1, stats);

  if (stats.maxDepth > MAX_DEPTH) {
    report("WARN", t.name, `schema nests ${stats.maxDepth} levels - OpenAI strict mode caps at ${MAX_DEPTH}`);
  }
}

await client.close();

// ---- report ---------------------------------------------------------------
const errors = findings.filter((f) => f.sev === "ERROR");
const warns = findings.filter((f) => f.sev === "WARN");

console.log(`\nMCP schema conformance - ${base}`);
console.log(`${tools.length} tools, ${(totalSchemaBytes / 1024).toFixed(1)} KB of tool definitions\n`);

// Tool-list weight is its own portability risk: every agent pays this on every
// single request, and some clients truncate long tool lists rather than error.
if (totalSchemaBytes > 60_000) {
  console.log(`NOTE: the tool list is large. Every request in every workflow carries it,`);
  console.log(`      and some clients truncate rather than fail. Worth measuring against`);
  console.log(`      Codex specifically before assuming all ${tools.length} tools arrive.\n`);
}

for (const group of [errors, warns]) {
  if (!group.length) continue;
  const byTool = new Map();
  for (const f of group) {
    if (!byTool.has(f.tool)) byTool.set(f.tool, []);
    byTool.get(f.tool).push(f.msg);
  }
  console.log(`${group[0].sev} (${group.length}):`);
  for (const [tool, msgs] of byTool) {
    console.log(`  ${tool}`);
    for (const m of msgs) console.log(`    - ${m}`);
  }
  console.log();
}

if (!errors.length && !warns.length) console.log("Clean - no portability findings.\n");
console.log(errors.length ? `FAILED - ${errors.length} error(s).` : `PASSED${warns.length ? ` - ${warns.length} warning(s), none blocking.` : "."}`);
process.exit(errors.length ? 1 : 0);
