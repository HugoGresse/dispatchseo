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
import { spawnSync } from "node:child_process";

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
    // Two accepted gates: the current detector (`pkg.outputs.pnpm_pinned`,
    // which also resolves npm/yarn/bun/none repos - 2026-08-02) and its
    // pnpm-only predecessor (`pnpm_pin.outputs.pinned`), which this repo's
    // own live copies keep carrying until the post-deploy pack auto-sync
    // rewrites them.
    if (!/(pnpm_pin\.outputs\.pinned|pkg\.outputs\.pnpm_pinned)\s*==\s*'0'/.test(block)) {
      fail(
        where,
        "conditional-pnpm-version",
        "a pnpm/action-setup step passes a `version:` input without being gated on the no-pin " +
          "detector output (steps.pkg.outputs.pnpm_pinned == '0'). pnpm/action-setup hard-errors " +
          "when a version input sits alongside package.json's packageManager pin, which kills the " +
          "workflow at setup on every run. Detect the pin at run time and use two mutually-exclusive steps.",
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

// ---- rule 4: the agent usage-limit classifier knows every wording ---------
// A subscription that has run out of hours is a DEFERRAL - the build stays due
// and the next dispatch retries it. A failure is a red banner, an alert email,
// and a suggestion stuck in_progress until the stuck-build sweep frees it hours
// later. Which one the owner gets is decided by one grep in the workflow, so a
// wording that grep does not know is a routine pause dressed up as a breakage.
//
// That is not hypothetical: the classifier matched usage-limit / limit-reached
// / rate-limit, and the subscription's actual message is "You've hit your
// session limit · resets 1:50pm (UTC)". It failed the run instead (2026-08-02).
// cron-alerts.ts's CUSTOMER_ACTIONABLE already carried "session limit" - two
// copies of one fact, and the copy that decides defer-vs-fail was the stale
// one. This rule pins both to the same phrase list.
const AGENT_LIMIT_PHRASES = ["session limit", "usage limit", "limit reached"];

function checkAgentLimitClassifier({ where, content }) {
  const branch = content.indexOf('AGENT" = "claude"');
  if (branch === -1) return; // not a builder workflow
  const region = content.slice(branch, branch + 2000);
  const grep = region.match(/grep -qiE '([^']+)'/);
  if (!grep) {
    fail(where, "agent-limit-classifier", "the Claude branch has no `grep -qiE '...'` limit classifier - a usage limit would be reported as a hard failure");
    return;
  }
  for (const phrase of AGENT_LIMIT_PHRASES) {
    if (!grep[1].includes(phrase)) {
      fail(
        where,
        "agent-limit-classifier",
        `the Claude usage-limit classifier does not match "${phrase}". A subscription that says that gets a ` +
          `failure email and a stuck build instead of a quiet deferral. Pattern is: ${grep[1]}`,
      );
    }
  }
}

// ---- rule 5: every `run: |` block must parse as bash -----------------------
// Why (2026-08-06): the Cursor classify step shipped a JS template-literal
// escape slip - `\"` collapses to a bare quote where `\\"` was meant - so the
// generated bash carried an unbalanced string and the WHOLE classify step died
// on a syntax error for every Cursor run of seo-daily/seo-tools, skipping the
// dashboard report with it. Review, the drift check and the golden snapshot
// all passed, because they compare text, and only a parser catches a parser
// error. So: pull each literal-block script out of the YAML the same way the
// runner does (dedent to the first body line), blank out `${{ }}` expressions
// (GitHub substitutes those before bash ever sees the script), and `bash -n`.
function runBlocks(content) {
  const lines = content.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)run:\s*\|-?\s*$/);
    if (!m) continue;
    const keyIndent = m[1].length;
    const body = [];
    let bodyIndent = null;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "") {
        body.push("");
        continue;
      }
      const indent = line.match(/^\s*/)[0].length;
      if (indent <= keyIndent) break;
      if (bodyIndent === null) bodyIndent = indent;
      body.push(line.slice(Math.min(bodyIndent, indent)));
    }
    while (body.length && body[body.length - 1] === "") body.pop();
    if (body.length) blocks.push({ line: i + 1, script: body.join("\n") });
  }
  return blocks;
}

function checkRunBlocksParse({ where, content }) {
  for (const { line, script } of runBlocks(content)) {
    const neutral = script.replace(/\$\{\{[^}]*\}\}/g, "GITHUB_EXPR");
    const res = spawnSync("bash", ["-n"], { input: neutral, encoding: "utf8" });
    if (res.status !== 0) {
      const first = (res.stderr || "unknown parse error").trim().split("\n")[0];
      fail(
        `${where}:${line}`,
        "run-block-bash-syntax",
        `a \`run: |\` block does not parse as bash - the step would die on a syntax error before ` +
          `doing (or reporting) anything: ${first}`,
      );
    }
  }
}

for (const t of targets) {
  checkNoFatalAdaptMarker(t);
  checkPnpmSetupShape(t);
  checkLooksLikeWorkflow(t);
  checkAgentLimitClassifier(t);
  checkRunBlocksParse(t);
}

// The backend twin of rule 4. cron-alerts.ts decides whether the owner is even
// TOLD what happened; the workflow decides whether it counts as a failure. They
// have to agree on what a limit looks like or one of them is wrong by default.
{
  const where = "src/lib/cron-alerts.ts";
  try {
    const content = readFileSync(join(root, "src", "lib", "cron-alerts.ts"), "utf8");
    const block = content.match(/CUSTOMER_ACTIONABLE[\s\S]{0,400}?test:\s*\/([^/]+)\//);
    if (!block) {
      fail(where, "agent-limit-classifier", "could not find the CUSTOMER_ACTIONABLE usage-limit test - if it moved, update this lint with it");
    } else {
      for (const phrase of AGENT_LIMIT_PHRASES) {
        if (!block[1].includes(phrase)) {
          fail(
            where,
            "agent-limit-classifier",
            `CUSTOMER_ACTIONABLE's first test does not match "${phrase}", so an owner hitting it gets an ` +
              `operator-worded alert with nothing to act on. Keep it in step with the pack workflows.`,
          );
        }
      }
    }
  } catch (e) {
    fail(where, "agent-limit-classifier", `could not read: ${e.message}`);
  }
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
