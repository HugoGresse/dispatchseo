// The Claude regression guard.
//
// Adding a second coding agent means routing every hardcoded Claude string
// through a registry. That refactor is only safe if Claude's rendered output is
// provably unchanged - and "provably" cannot mean "I read the diff", because
// these strings are pasted by owners into terminals where a single wrong flag
// is a dead install. The connect and setup commands in particular carry hard-won
// detail: --transport http, --scope local, argument ORDER (the CLI's parser
// throws on options before the name), the Windows ?key= form that exists because
// the header variant is silently dropped on that platform, and the PowerShell
// twins that exist because `&&`, `test` and `printf` are POSIX-only.
//
// So: snapshot every command this project can hand a user, commit it, and diff
// on every push. A deliberate change means regenerating the snapshot in the same
// commit - which puts the before/after in the review, where it belongs.
//
// Deliberately credential-free and network-free: it imports pure string
// builders and nothing else, so it can run as a REQUIRED check on pull requests
// from forks, where secrets are unavailable.
//
//   node --experimental-strip-types scripts/agent-golden.mjs          # regenerate
//   node --experimental-strip-types scripts/agent-golden.mjs --check  # verify
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(here, "../test/golden/agent-commands.json");

// Imported by RELATIVE path, not the @/ alias: this runs under plain node with
// type stripping, which has no idea about tsconfig paths. mcp-connect.ts is
// import-free by design (it is client-safe), so it loads standalone.
const mcp = await import("../src/lib/mcp-connect.ts");

// A fixture, never a real project. The values are obviously fake so a snapshot
// diff can never be mistaken for a leaked token.
const SLUG = "goldensite";
const ORIGIN = "https://backend.example.test";
const TOKEN = "fixture-token-do-not-use";

const snapshot = {
  _readme:
    "Golden snapshot of every command DispatchSEO hands an owner. Regenerate with " +
    "`node --experimental-strip-types scripts/agent-golden.mjs` and commit the diff " +
    "alongside the change that caused it. Never edit by hand.",
  fixture: { slug: SLUG, origin: ORIGIN, token: TOKEN },
  claude: {
    serverName: mcp.mcpServerName(SLUG),
    mcpAdd: mcp.mcpAddCommand(SLUG, ORIGIN, TOKEN),
    mcpAddPowershell: mcp.mcpAddCommandPS(SLUG, ORIGIN, TOKEN),
    ghPermission: mcp.ghPermissionCommand(),
    connect: mcp.connectCommand(SLUG, ORIGIN, TOKEN),
    connectPowershell: mcp.connectCommandPS(SLUG, ORIGIN, TOKEN),
    setup: mcp.setupCommand(SLUG, ORIGIN, TOKEN),
    setupBundled: mcp.setupCommand(SLUG, ORIGIN, TOKEN, true),
    setupPowershell: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN),
    setupPowershellBundled: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN, true),
  },
  // Codex earns the same treatment for the same reason: these are pastes, and a
  // paste is either exactly right or it is a dead install. The bash and
  // PowerShell entries being identical is not a copy-paste slip - it is the
  // property the URL-key form was chosen for, and the snapshot is where that
  // stays true.
  codex: {
    serverName: mcp.mcpServerName(SLUG),
    mcpAdd: mcp.codexMcpAddCommand(SLUG, ORIGIN, TOKEN),
    connect: mcp.codexConnectCommand(SLUG, ORIGIN, TOKEN),
    connectPowershell: mcp.codexConnectCommandPS(SLUG, ORIGIN, TOKEN),
    setup: mcp.setupCommand(SLUG, ORIGIN, TOKEN, false, "codex"),
    setupBundled: mcp.setupCommand(SLUG, ORIGIN, TOKEN, true, "codex"),
    setupPowershell: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN, false, "codex"),
    setupPowershellBundled: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN, true, "codex"),
  },
  // The raw details handed to any other MCP client. No command to get wrong,
  // but the URL shape and the header spelling are still things a client will
  // reject character-for-character.
  generic: mcp.genericMcpConfig(SLUG, ORIGIN, TOKEN),
};

const rendered = JSON.stringify(snapshot, null, 2) + "\n";
const check = process.argv.includes("--check");

if (!check) {
  mkdirSync(dirname(GOLDEN), { recursive: true });
  writeFileSync(GOLDEN, rendered);
  console.log(`Wrote ${GOLDEN}`);
  process.exit(0);
}

let current = "";
try {
  current = readFileSync(GOLDEN, "utf8");
} catch {
  console.error(
    "No golden snapshot exists yet. Create it with:\n" +
      "  node --experimental-strip-types scripts/agent-golden.mjs",
  );
  process.exit(1);
}

if (current === rendered) {
  console.log("Agent commands match the golden snapshot - Claude's output is unchanged.");
  process.exit(0);
}

// Show WHICH command changed, not a whole-file diff: these strings are long and
// a "one of these ten lines differs" report is what a reviewer actually needs.
const before = JSON.parse(current);
const after = snapshot;
console.error("Agent command output CHANGED versus the golden snapshot:\n");
for (const agent of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (agent === "_readme" || agent === "fixture") continue;
  const b = before[agent] ?? {};
  const a = after[agent] ?? {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (b[key] === a[key]) continue;
    console.error(`  ${agent}.${key}`);
    console.error(`    before: ${b[key] ?? "(absent)"}`);
    console.error(`    after:  ${a[key] ?? "(absent)"}\n`);
  }
}
console.error(
  "If this change is intended, regenerate and commit the snapshot in the SAME commit:\n" +
    "  node --experimental-strip-types scripts/agent-golden.mjs",
);
process.exit(1);
