// Cursor's CI knowledge - the per-agent module for the Cursor CLI. Same
// contract as claude.mjs and codex.mjs; see claude.mjs's header and
// scripts/agent-ci/index.mjs.
//
// Every fact below is measured against cursor-agent 2026.07.23-e383d2b by
// installing and running it, including against the production MCP server - see
// docs-private/CURSOR_FACTS.md for the runs behind each one. Four of those
// measurements shape this whole file:
//
//   1. There is NO official GitHub Action, so the invoke is a `run:` step
//      rather than a `uses:`. Both other agents get an action; this one
//      installs a CLI and calls it.
//   2. `.cursor/mcp.json` does NOT expand ${VAR}. The pack's mcp-ci.json is
//      already Cursor's shape, which makes copying it look free - but the
//      credentials arrive literally and the server is reported as "not loaded
//      (needs approval)", which sends anyone debugging it into the approval
//      system instead of at the credential. So the config is RENDERED.
//   3. `--output-format json` returns {is_error, subtype, result, usage}, so
//      classification branches on a boolean and an enum instead of grepping
//      warning prose. This is why a Cursor builder is safe to write at all.
//   4. Three flags are each individually required for an unattended run:
//      --trust (a fresh checkout is an untrusted workspace), --force (command
//      approval) and --approve-mcps (server approval). Missing any one of them
//      stops the run dead with nobody there to answer.

const id = "cursor";

const resolveEnvName = "CURSOR_API_KEY";
const secretName = "CURSOR_API_KEY";

// Pinned. `https://cursor.com/install` floats to whatever is current, which is
// right for the canary (it exists to learn) and wrong here (a builder that
// changes CLI version without anyone deciding to). The installer downloads
// this exact path, so pinning is just naming the version it would have taken.
const CLI_VERSION = "2026.07.23-e383d2b";

function resolveCaseArm(variant) {
  const verb = variant === "validate" ? "validates" : "builds";
  return `            cursor)
              if [ -z "$CURSOR_API_KEY" ]; then
                echo "::error::This project ${verb} with Cursor, but the CURSOR_API_KEY secret is missing or empty on this repo. Cursor API keys need a paid Cursor plan - a runner has no browser, so the interactive 'cursor-agent login' is not an option here. Add the key with 'gh secret set CURSOR_API_KEY', or switch this project to Claude Code or Codex on your DispatchSEO dashboard."
                exit 1
              fi
              case "$CURSOR_API_KEY" in
                sk-ant-*)
                  echo "::error::CURSOR_API_KEY holds a Claude credential (it starts with sk-ant-). The wrong secret was pasted. Put the Claude token in CLAUDE_CODE_OAUTH_TOKEN and a Cursor API key here."
                  exit 1 ;;
                sk-*)
                  echo "::error::CURSOR_API_KEY holds an OpenAI key (it starts with sk-). The wrong secret was pasted. Put the OpenAI key in OPENAI_API_KEY and a Cursor API key here."
                  exit 1 ;;
                *[[:space:]]*)
                  # [[:space:]], never a literal tab in the pattern: a tab
                  # character in generated YAML is invalid indentation, and
                  # pipeline-pack-lint fails the build on it.
                  echo "::error::CURSOR_API_KEY contains whitespace, which almost always means it was line-wrapped when it was copied. Re-copy the key and set it again with: printf '%s' \\"\\$KEY\\" | tr -d '[:space:]' | gh secret set CURSOR_API_KEY"
                  exit 1 ;;
                *) : ;;
              esac ;;`;
}

// No apply_patch worries here (Cursor has real file tools), but the
// unattended rule is the same one every agent needs and for the same reason:
// a run that stops to ask a question builds nothing, and there is nobody on a
// scheduled runner to answer it.
const promptPreamble =
  "ENVIRONMENT RULE (read first, it overrides habit): you are running UNATTENDED on a CI runner. There is nobody here to answer a question, approve a step, or pick between options. If you ever find yourself about to ask for approval or a go/no-go, do not: choose the safest option that still completes the task, do it, and say what you chose in the final report. A run that stops to ask a question builds nothing and is a failed run. Your final message is read by a script, so end with exactly what you were asked to end with and nothing after it.";

// Install + render + approve. One step, because all three are prerequisites of
// the same invoke and splitting them only makes the failure harder to place.
function configSteps({ guardIf, variant }) {
  const cond = [guardIf, `steps.agent.outputs.agent == '${id}'`].filter(Boolean).join(" && ");
  const source = variant === "validate" ? ".github/mcp-validate.json" : ".github/mcp-ci.json";
  const envLines =
    variant === "validate"
      ? ""
      : `        env:
          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}
          DATAFORSEO_LOGIN: \${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: \${{ secrets.DATAFORSEO_PASSWORD }}
`;
  return [
    `      # Cursor has no GitHub Action, so the CLI is installed here. Pinned to a
      # known version rather than piping cursor.com/install, which floats.
      #
      # Then the MCP config, and this is the part that bites. The pack's
      # mcp-ci.json is ALREADY Cursor's shape, so copying it looks free - but
      # Cursor does not expand \${VAR} the way Claude does, and the failure is
      # disguised: the server reports "not loaded (needs approval)" while
      # \`mcp enable\` insists it is approved, so the hunt starts in the approval
      # system rather than at the credential. Render the values in.
      #
      # \`mcp enable\` is not optional either. An unapproved server is not merely
      # unreachable, it is absent - the agent runs happily with zero tools.
      - name: Install Cursor and write its MCP config
        if: ${cond}
${envLines}        run: |
          # The WHOLE package, into a directory of its own. cursor-agent is a
          # bash launcher rather than a static binary and loads ~95 sibling
          # files from beside itself, so extracting just the executable gives a
          # command that exists and cannot run. Its own directory keeps those
          # 95 files out of $RUNNER_TEMP, which this job also uses for the
          # prompt and the result.
          mkdir -p "$RUNNER_TEMP/cursor-cli" "$HOME/.local/bin"
          curl -fsSL "https://downloads.cursor.com/lab/${CLI_VERSION}/linux/x64/agent-cli-package.tar.gz" \\
            | tar -xz --strip-components=1 -C "$RUNNER_TEMP/cursor-cli"
          ln -sf "$RUNNER_TEMP/cursor-cli/cursor-agent" "$HOME/.local/bin/cursor-agent"
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
          export PATH="$HOME/.local/bin:$PATH"
          cursor-agent --version

          # python3, not sed: a credential can contain any character, and this
          # writes JSON, so the values are JSON-escaped rather than pasted.
          mkdir -p .cursor
          python3 - ${source} .cursor/mcp.json <<'PY'
          import json, os, sys
          src, dst = sys.argv[1], sys.argv[2]
          text = open(src).read()
          for var in ("SEO_MCP_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"):
              # json.dumps then strip the quotes: escapes exactly what JSON
              # needs escaping and nothing else.
              val = json.dumps(os.environ.get(var, ""))[1:-1]
              text = text.replace("${" + var + "}", val)
          cfg = json.loads(text)
          json.dump(cfg, open(dst, "w"), indent=2)
          print("servers configured:", ", ".join(cfg.get("mcpServers", {})))
          PY

          # Approve every server the config declares. Per-directory state, so a
          # fresh checkout has none of it and this runs every time.
          for s in $(python3 -c "import json;print(' '.join(json.load(open('.cursor/mcp.json')).get('mcpServers',{})))"); do
            cursor-agent mcp enable "$s"
          done
          echo "--- mcp list ---"
          cursor-agent mcp list`,
  ];
}

const ENV_LINES = {
  agentToken: `          CURSOR_API_KEY: \${{ secrets.CURSOR_API_KEY }}`,
  seoKey: `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`,
  dataforseo: `          DATAFORSEO_LOGIN: \${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: \${{ secrets.DATAFORSEO_PASSWORD }}`,
  githubToken: `          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  ghToken: `          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  ghTokenCommented: `          # This workflow's prompt names $GITHUB_TOKEN explicitly, and Cursor
          # runs as a plain shell step with no action to inject it.
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  placeholders: `          NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co"
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key"
          NEXT_PUBLIC_SITE_URL: "https://{{DOMAIN}}"`,
  prNumber: `          PR_NUMBER: \${{ github.event.pull_request.number || inputs.pr_number }}`,
};

function invokeStep({ name, guardIf, prompt, env, continueOnError }) {
  const lines = [];
  lines.push(`      # The Cursor twin. Same task prompt, generated from the same source -`);
  lines.push(`      # the agent's behaviour must not depend on which one is holding the`);
  lines.push(`      # playbook - plus the unattended-environment preamble above it.`);
  lines.push(`      #`);
  lines.push(`      # A plain run step, because Cursor ships no GitHub Action. The three`);
  lines.push(`      # flags are each separately required and each was measured: --trust (a`);
  lines.push(`      # fresh checkout is an untrusted workspace and the run refuses outright),`);
  lines.push(`      # --force (command approval), --approve-mcps (server approval).`);
  lines.push(`      #`);
  lines.push(`      # --output-format json is what makes the classify step below honest: it`);
  lines.push(`      # returns {is_error, subtype, result, usage}, so a failure is read from a`);
  lines.push(`      # field rather than guessed at from warning text.`);
  lines.push(`      #`);
  lines.push(`      # Model is overridable per repo: availability is per-account, and the`);
  lines.push(`      # account default ("auto") is the sane fallback. There is NO turn budget`);
  lines.push(`      # to set - Cursor has no --max-turns equivalent, so the job's`);
  lines.push(`      # timeout-minutes is the only ceiling on a runaway run, and on Cursor a`);
  lines.push(`      # runaway also eats the plan's monthly usage pool.`);
  lines.push(`      - name: ${name} (Cursor)`);
  const cond = [guardIf, `steps.agent.outputs.agent == '${id}'`].filter(Boolean).join(" && ");
  lines.push(`        if: ${cond}`);
  lines.push(`        id: ${id}`);
  if (continueOnError) {
    lines.push(`        # Never fail the job at this step: the classify step below reads the`);
    lines.push(`        # outcome and decides what the run MEANS (transient limit vs dead`);
    lines.push(`        # account), which it can only do if it is reachable.`);
    lines.push(`        continue-on-error: true`);
  }
  lines.push(`        env:`);
  for (const key of env) lines.push(ENV_LINES[key]);
  lines.push(`        run: |`);
  lines.push(`          export PATH="$HOME/.local/bin:$PATH"`);
  // Single-quoted heredoc: the prompts contain backticks, $ and quotes, and
  // every one of them must reach the agent verbatim.
  lines.push(`          cat > "$RUNNER_TEMP/cursor-prompt.txt" <<'DSEOF'`);
  const full = `${promptPreamble}\n\n${prompt}`;
  for (const l of full.split("\n")) lines.push(l ? `          ${l}` : "");
  lines.push(`          DSEOF`);
  lines.push(`          set +e`);
  lines.push(`          cursor-agent -p "$(cat "$RUNNER_TEMP/cursor-prompt.txt")" \\`);
  lines.push(`            --output-format json --trust --force --approve-mcps \\`);
  lines.push(`            --model "\${{ vars.SEO_CURSOR_MODEL || 'auto' }}" \\`);
  lines.push(`            > "$RUNNER_TEMP/cursor-out.json" 2> "$RUNNER_TEMP/cursor-err.txt"`);
  lines.push(`          code=$?`);
  lines.push(`          set -e`);
  lines.push(`          # The final message, for the classify step. jq tolerates a truncated`);
  lines.push(`          # or absent file, which is what a killed run leaves behind.`);
  lines.push(`          jq -r '.result // empty' "$RUNNER_TEMP/cursor-out.json" 2>/dev/null > "$RUNNER_TEMP/cursor-msg.txt" || true`);
  lines.push(`          echo "--- cursor exit $code ---"`);
  lines.push(`          cat "$RUNNER_TEMP/cursor-msg.txt"`);
  lines.push(`          [ -s "$RUNNER_TEMP/cursor-err.txt" ] && { echo "--- stderr ---"; cat "$RUNNER_TEMP/cursor-err.txt"; }`);
  lines.push(`          exit $code`);
  return lines.join("\n");
}

// The JSON result, not a transcript. Cursor's session store is a binary sqlite
// file under ~/.cursor/chats/<hash>/<session-id>/store.db, so there is nothing
// human-readable to upload; this file is the whole record of what happened.
const transcriptPath = `\${{ runner.temp }}/cursor-out.json`;

const classifyMsgExtraction = `            msg=$(cat "$RUNNER_TEMP/cursor-msg.txt" 2>/dev/null)
            [ -n "$msg" ] || msg=$(jq -r '.result // empty' "$RUNNER_TEMP/cursor-out.json" 2>/dev/null)`;

const classifyEnv = [`          CURSOR_API_KEY: \${{ secrets.CURSOR_API_KEY }}`];

// Classify: what a non-success outcome MEANS for Cursor.
//
// Unlike the Codex branch, this does NOT need to probe an API to tell a
// transient limit from a dead account, because --output-format json states it:
// `is_error` plus `subtype`. What it must never do is treat an UNRECOGNISED
// subtype as transient - a deferral is silent, and a silent deferral on a real
// failure is the codex-429 mistake. Unknown always falls through to fail.
//
// The quota and rate-limit subtype spellings have not been observed yet (they
// need an exhausted account). The patterns below are matched loosely against
// whatever subtype arrives, and anything unmatched is loud, so a spelling we
// guessed wrong costs a noisy alert rather than a silent dead pipeline.
function classifyBranch() {
  return `          if [ "$AGENT" = "cursor" ]; then
            sub=$(jq -r '.subtype // empty' "$RUNNER_TEMP/cursor-out.json" 2>/dev/null)
            iserr=$(jq -r '.is_error // empty' "$RUNNER_TEMP/cursor-out.json" 2>/dev/null)
            err=$(tail -c 400 "$RUNNER_TEMP/cursor-err.txt" 2>/dev/null)
            case "$sub" in
              *rate*limit*|*quota*|*usage*limit*|*too*many*)
                # Clears by itself. The job stays due and is re-dispatched.
                defer "Cursor hit a usage or rate limit this run (\\"$sub\\") - the dashboard keeps this build due and re-dispatches it within a few hours. Not a failure." ;;
              *auth*|*unauthor*|*invalid*key*|*forbidden*)
                fail "Cursor rejected the CURSOR_API_KEY secret on this repo (\\"$sub\\"). The key was probably revoked or the plan lapsed - Cursor API keys need a paid plan. Create a fresh key and set it again with 'gh secret set CURSOR_API_KEY'." ;;
              "")
                # No parseable JSON at all: killed, timed out, or died before
                # it could write a result. Never quiet.
                reason="Cursor produced no result (the job most likely hit its time limit)"
                [ -n "$err" ] && reason="Cursor failed before producing a result: $err"
                fail "$reason" ;;
              *)
                # Recognised as an error but not as one that clears by waiting.
                reason="Cursor failed (\\"$sub\\", is_error=\${iserr:-unknown})"
                [ -n "$msg" ] && reason="$reason. Last message: $(printf '%s' "$msg" | tail -c 300)"
                [ -n "$err" ] && reason="$reason. stderr: $err"
                fail "$reason" ;;
            esac
          fi`;
}

const basicClassifyBranch = `          if [ "$AGENT" = "cursor" ]; then
            sub=$(jq -r '.subtype // empty' "$RUNNER_TEMP/cursor-out.json" 2>/dev/null)
            case "$sub" in
              *rate*limit*|*quota*|*usage*limit*|*too*many*)
                defer "Cursor hit a usage or rate limit this run - it clears by itself, so the job stays due and is retried automatically. Not a failure." ;;
              *auth*|*unauthor*|*invalid*key*|*forbidden*)
                fail "Cursor rejected the CURSOR_API_KEY secret on this repo. Cursor API keys need a paid plan - create a fresh key and set it again with 'gh secret set CURSOR_API_KEY'." ;;
              *)
                fail "workflow failed - $RUN_URL" ;;
            esac
          fi`;

const basicClassifyEnv = [`          CURSOR_API_KEY: \${{ secrets.CURSOR_API_KEY }}`];

// token-check liveness.
//
// `cursor-agent models` is the cheap probe - it needs auth and returns the
// account's model list without spending a model call. The trap, measured: it
// EXITS 0 even when the key is invalid, and `cursor-agent status` ignores
// CURSOR_API_KEY entirely (it reports the interactive login, which does not
// exist on a runner). So this reads the OUTPUT and never the exit code. A
// check written the obvious way passes for every broken key there will ever be.
function livenessStep() {
  return `      # Measured trap, and the reason this looks paranoid: \`cursor-agent models\`
      # exits 0 even when the API key is invalid, and \`cursor-agent status\`
      # ignores CURSOR_API_KEY altogether (it reports the interactive login,
      # which a runner does not have). Both obvious checks therefore pass for
      # every broken key that will ever exist. This one reads the text.
      - name: Cursor key liveness
        id: liveness_cursor
        if: steps.agent.outputs.agent == 'cursor'
        env:
          CURSOR_API_KEY: \${{ secrets.CURSOR_API_KEY }}
        run: |
          if [ -z "$CURSOR_API_KEY" ]; then
            echo "This project builds with Cursor, but the CURSOR_API_KEY secret is missing or empty on this repo. Cursor API keys need a paid Cursor plan - a runner has no browser, so 'cursor-agent login' is not an option. Add the key with 'gh secret set CURSOR_API_KEY', or switch this project to Claude Code or Codex on your dashboard." > "$RUNNER_TEMP/agent-failure.txt"
            cat "$RUNNER_TEMP/agent-failure.txt"; exit 1
          fi
          # Whole package into its own directory - the launcher needs its
          # siblings; see the config step for the long version.
          mkdir -p "$RUNNER_TEMP/cursor-cli"
          curl -fsSL "https://downloads.cursor.com/lab/${CLI_VERSION}/linux/x64/agent-cli-package.tar.gz" \\
            | tar -xz --strip-components=1 -C "$RUNNER_TEMP/cursor-cli"
          out=$("$RUNNER_TEMP/cursor-cli/cursor-agent" models 2>&1) || true
          if printf '%s' "$out" | grep -qi "API key is invalid\\|Authentication required\\|Unauthorized"; then
            echo "Cursor rejected the CURSOR_API_KEY secret on this repo. The key was probably revoked, or the paid plan that issued it lapsed - Cursor API keys need one. Create a fresh key and set it again with 'gh secret set CURSOR_API_KEY'." > "$RUNNER_TEMP/agent-failure.txt"
            cat "$RUNNER_TEMP/agent-failure.txt"; exit 1
          fi
          if ! printf '%s' "$out" | grep -q "Available models"; then
            echo "Could not check the Cursor key - the CLI answered with something unrecognised: $(printf '%s' "$out" | tail -c 300)" > "$RUNNER_TEMP/agent-failure.txt"
            cat "$RUNNER_TEMP/agent-failure.txt"; exit 1
          fi
          echo "Cursor key is live."`;
}

const livenessFailureSnippet = `            # The Cursor branch already resolved this into a sentence naming the
            # actual fix, so pass that through rather than flattening it.
            msg=$(cat "$RUNNER_TEMP/agent-failure.txt" 2>/dev/null)
            [ -n "$msg" ] && reason="Cursor credential check failed: $msg"`;

export default {
  id,
  isDefault: false,
  secretName,
  resolveEnvName,
  resolveCaseArm,
  promptPreamble,
  configSteps,
  invokeStep,
  transcriptPath,
  classifyMsgExtraction,
  classifyEnv,
  classifyBranch,
  basicClassifyBranch,
  basicClassifyEnv,
  livenessStep,
  livenessFailureSnippet,
};
