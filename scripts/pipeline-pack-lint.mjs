#!/usr/bin/env node
// Lints the pipeline pack for shapes that cannot fail SAFELY in a customer's
// repo. Runs credential-free on every PR (pr-check.yml).
//
//   node scripts/pipeline-pack-lint.mjs
//
// Why this exists (2026-07-30). The pack's three build workflows carried a
// comment reading "INSTALL-ADAPT: if this repo's package.json has a
// packageManager field, DELETE the version input below". pnpm/action-setup
// hard-errors when a version input sits alongside a packageManager pin, so any
// install that skipped that edit produced a repo whose builder died at step 2
// of every run, 13 seconds in - before the step that reports failures to the
// dashboard, so it failed silently too. It shipped that way and broke every
// installed repo with a pin, including our own.
//
// The lesson generalises past pnpm: a template must never depend on an
// install-time edit whose omission is fatal, because the installer is an LLM
// adapting an unfamiliar repo and "usually" is not good enough when the
// failure mode is a permanently dead pipeline. Encode the decision in the
// workflow so it resolves at RUN time, in the repo, every time.
//
// The two rules below are narrow on purpose - each one names a shape we have
// actually shipped and been burned by. Rule 2 pairs with the "pnpm setup boots
// in both repo shapes" job in pr-check.yml: this rule ties the pack to the two
// blessed shapes, that job proves those two shapes actually work. Neither is
// sufficient alone.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const problems = [];
function fail(where, rule, message) {
  problems.push({ where, rule, message });
}

// ---- the files under audit -------------------------------------------------
// The pack JSON is what customers actually receive, so it is the primary
// target. Our own live copies are audited too: the install re-sync overwrites
// them from the pack, but a hand-edit between syncs would otherwise reach
// production unchecked - that is how the 2026-07-30 fix got reverted.
const targets = [];

const pack = JSON.parse(readFileSync(join(root, "src", "lib", "pipeline-pack.json"), "utf8"));
for (const f of pack.files) {
  if (f.path.startsWith(".github/workflows/")) {
    targets.push({ where: `pipeline-pack.json > ${f.path}`, content: f.content });
  }
}
if (!targets.length) fail("pipeline-pack.json", "sanity", "no workflow files found in the pack");

const liveDir = join(root, ".github", "workflows");
for (const name of readdirSync(liveDir)) {
  if (!name.startsWith("seo-") || !name.endsWith(".yml")) continue;
  targets.push({
    where: `.github/workflows/${name}`,
    content: readFileSync(join(liveDir, name), "utf8"),
  });
}

// ---- rule 1: no install-time edit whose omission is fatal ------------------
// The `# INSTALL-ADAPT:` marker itself is fine - the install genuinely does
// adapt build commands and paths. What is banned is a marker that tells the
// installer to DELETE or REMOVE something, because skipping it leaves the
// fatal shape behind rather than a merely imperfect one.
function checkNoFatalAdaptMarker({ where, content }) {
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (!/#\s*INSTALL-ADAPT:/.test(line)) return;
    // Collect the contiguous comment run this marker opens.
    const block = [];
    for (let j = i; j < lines.length && /^\s*#/.test(lines[j]); j++) block.push(lines[j]);
    const text = block.join(" ");
    if (/\b(DELETE|REMOVE)\b/.test(text)) {
      fail(
        `${where}:${i + 1}`,
        "no-fatal-install-adapt",
        "an INSTALL-ADAPT marker tells the installer to DELETE/REMOVE something. If skipping that " +
          "edit breaks the run, the workflow must decide at run time instead (two mutually-exclusive " +
          "steps with `if:` conditions), not rely on the installer noticing a comment.",
      );
    }
  });
}

// ---- rule 2: pnpm/action-setup version input must be conditional -----------
// A `version:` input is only safe on a step that runs ONLY when the repo has no
// packageManager pin. Unconditionally, it hard-errors on every pinned repo.
function stepBlocks(content) {
  const lines = content.split("\n");
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (/^\s{4,}- /.test(line)) {
      if (current) blocks.push(current);
      current = { start: line, lines: [line] };
    } else if (current) {
      // A new top-level or job-level key ends the steps list.
      if (/^\s{0,4}\S/.test(line) && !/^\s*#/.test(line)) {
        blocks.push(current);
        current = null;
      } else {
        current.lines.push(line);
      }
    }
  }
  if (current) blocks.push(current);
  return blocks.map((b) => b.lines.join("\n"));
}

function checkPnpmSetupShape({ where, content }) {
  for (const block of stepBlocks(content)) {
    if (!/uses:\s*pnpm\/action-setup/.test(block)) continue;
    if (!/^\s*version:/m.test(block)) continue; // no version input - always safe
    if (!/pnpm_pin\.outputs\.pinned\s*==\s*'0'/.test(block)) {
      fail(
        where,
        "conditional-pnpm-version",
        "a pnpm/action-setup step passes a `version:` input without being gated on " +
          "steps.pnpm_pin.outputs.pinned == '0'. pnpm/action-setup hard-errors when a version input " +
          "sits alongside package.json's packageManager pin, which kills the workflow at setup on " +
          "every run. Detect the pin at run time and use two mutually-exclusive steps.",
      );
    }
  }
}

// ---- rule 3: cheap well-formedness ----------------------------------------
// Not a YAML parse (no parser dependency) - just proof each shipped workflow
// still looks like a workflow, so a truncated or mangled template is caught
// before it becomes 20 repos' dead pipeline.
function checkLooksLikeWorkflow({ where, content }) {
  for (const key of ["on:", "jobs:"]) {
    if (!new RegExp(`^${key.replace(":", ":")}`, "m").test(content)) {
      fail(where, "workflow-shape", `missing a top-level \`${key}\` key`);
    }
  }
  if (/\t/.test(content)) fail(where, "workflow-shape", "contains a tab character (invalid YAML indentation)");
}

for (const t of targets) {
  checkNoFatalAdaptMarker(t);
  checkPnpmSetupShape(t);
  checkLooksLikeWorkflow(t);
}

// mcp-codex.toml's truncation contract. getPipelinePack strips the DataForSEO
// section for no-DataForSEO projects by indexOf on the marker line - a plain
// string match with no guard, so a reformatted comment silently disables the
// truncation and every free-mode Codex project ships a dataforseo stdio
// server wired to blank creds, crashing unattended runs. The JSON twin is
// safe by construction (JSON.parse + delete); this asymmetry is Codex-only,
// which is why the lint holds the TOML to the contract explicitly.
{
  const MARKER = "# --- dataforseo ---";
  const tomlPath = "templates/pipeline/.github/mcp-codex.toml";
  const where = tomlPath;
  try {
    const content = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", tomlPath), "utf8");
    const idx = content.indexOf(MARKER);
    if (idx === -1) {
      fail(where, "codex-toml-marker", `missing the exact truncation marker line "${MARKER}" that getPipelinePack strips at`);
    } else {
      const truncated = content.slice(0, idx).trimEnd();
      if (!/default_tools_approval_mode = "approve"/.test(truncated)) {
        fail(where, "codex-toml-marker", "the truncated (free-mode) config loses the seo-manager approval mode - every tool call would return 'user cancelled'");
      }
      const afterMarker = content.slice(idx);
      const tablesAfter = [...afterMarker.matchAll(/^\[mcp_servers\.([^\]]+)\]/gm)].map((m) => m[1]);
      if (tablesAfter.join(",") !== "dataforseo") {
        fail(where, "codex-toml-marker", `the dataforseo section must be the ONLY server table after the marker (found: ${tablesAfter.join(", ") || "none"}) - anything else gets truncated away for free-mode projects`);
      }
      for (const token of ["${DATAFORSEO_LOGIN}", "${DATAFORSEO_PASSWORD}"]) {
        if (!afterMarker.includes(token)) {
          fail(where, "codex-toml-marker", `missing the ${token} token the workflows substitute at run time - Codex does not expand \${VAR} itself`);
        }
      }
    }
  } catch (e) {
    fail(where, "codex-toml-marker", `could not read: ${e.message}`);
  }
}

if (problems.length) {
  console.error(`pipeline-pack-lint: ${problems.length} problem(s)\n`);
  for (const p of problems) {
    console.error(`  ✗ [${p.rule}] ${p.where}`);
    console.error(`      ${p.message}\n`);
  }
  process.exit(1);
}
console.log(`pipeline-pack-lint: ${targets.length} workflow(s) checked, all clean.`);
