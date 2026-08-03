// Claude Code's CI knowledge - everything the pipeline workflows need to know
// about running Claude Code unattended on a GitHub Actions runner.
//
// This file is one of the per-agent modules under scripts/agent-ci/. Together
// with workflows.mjs (per-workflow parameters) and prompts.json (the task
// prompts), scripts/generate-agent-steps.mjs composes these into the agent
// blocks of every templates/pipeline workflow, between `>>> agent-steps`
// markers. NEVER edit those blocks in the workflow files - edit here and run
// `node --experimental-strip-types scripts/generate-agent-steps.mjs`.
//
// Adding a new agent = a new module in this directory implementing the same
// shape (see index.mjs for the contract), a matching entry in
// src/lib/agents/index.ts, and a regenerate. The workflows themselves never
// need editing again.

const id = "claude";

// The env name the resolve step reads the secret into. Deliberately NOT the
// secret's own name: the resolve script tests "$CLAUDE_TOKEN" and the name
// predates the registry - keep it stable so resolve scripts stay byte-familiar.
const resolveEnvName = "CLAUDE_TOKEN";
const secretName = "CLAUDE_CODE_OAUTH_TOKEN";

// Per-workflow wording for the resolve step's credential errors. The setup
// workflow cannot say "rerun the setup command" (that IS the setup command),
// and the validator says "validates" rather than "builds".
function resolveCaseArm(variant) {
  const verb = variant === "validate" ? "validates" : "builds";
  const missingFix =
    variant === "setup"
      ? "Reconnect Claude Code from your DispatchSEO dashboard (Settings), or set one by hand: run 'claude setup-token', then pipe the token into 'gh secret set CLAUDE_CODE_OAUTH_TOKEN' without any whitespace."
      : "Rerun the setup command from your DispatchSEO dashboard (it mints and VERIFIES a fresh token), or set one by hand: run 'claude setup-token', then pipe the token into 'gh secret set CLAUDE_CODE_OAUTH_TOKEN' without any whitespace.";
  const shapeFix =
    variant === "setup"
      ? "Reconnect Claude Code from your DispatchSEO dashboard to store a verified replacement."
      : "Rerun the setup command from your DispatchSEO dashboard to mint and verify a replacement.";
  return `            claude)
              if [ -z "$CLAUDE_TOKEN" ]; then
                echo "::error::This project ${verb} with Claude Code, but the CLAUDE_CODE_OAUTH_TOKEN secret is missing or empty on this repo. ${missingFix}"
                exit 1
              fi
              case "$CLAUDE_TOKEN" in
                sk-ant-oat*) : ;;
                *)
                  echo "::error::CLAUDE_CODE_OAUTH_TOKEN does not look like a Claude Code OAuth token (expected it to start with sk-ant-oat). It was probably line-wrapped or the wrong text was pasted when it was saved. ${shapeFix}"
                  exit 1 ;;
              esac ;;`;
}

// Claude needs no config file written at run time: claude-code-action reads
// .github/mcp-ci.json (or mcp-validate.json) directly via --mcp-config, and
// that JSON expands \${VAR} env references itself.
function configSteps() {
  return [];
}

// Named env line snippets the invoke step can carry, in the exact text the
// workflows have always shipped. workflows.mjs picks per workflow.
const ENV_LINES = {
  agentToken: `          CLAUDE_CODE_OAUTH_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`,
  seoKey: `          SEO_MCP_API_KEY: \${{ secrets.SEO_MCP_API_KEY }}`,
  dataforseo: `          DATAFORSEO_LOGIN: \${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: \${{ secrets.DATAFORSEO_PASSWORD }}`,
  githubToken: `          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  ghToken: `          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
  mcpTimeout: `          MCP_TIMEOUT: "120000"`,
  placeholders: `          # Placeholder public env so \`next build\` never trips on missing vars -
          # static blog pages do not call Supabase, and the clients are lazy.
          NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co"
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key"
          NEXT_PUBLIC_SITE_URL: "https://{{DOMAIN}}"`,
  prNumber: `          PR_NUMBER: \${{ github.event.pull_request.number || inputs.pr_number }}`,
};

// The invoke step. `prompt` arrives as plain text paragraphs; it is emitted as
// a YAML block scalar so backticks, quotes and \${{ }} expressions all survive
// verbatim and both agents provably receive the same task text.
function invokeStep({ name, guardIf, prompt, maxTurns, showFullOutput, mcpConfig, env, allowedBots, allowedBotsCommentLines, continueOnError }) {
  const lines = [];
  lines.push(`      - name: ${name}`);
  const cond = [guardIf, `steps.agent.outputs.agent == '${id}'`].filter(Boolean).join(" && ");
  lines.push(`        if: ${cond}`);
  lines.push(`        id: ${id}`);
  if (continueOnError) {
    lines.push(`        # Never fail the job at this step: the classify step below reads the`);
    lines.push(`        # outcome and decides what the run MEANS (transient rate limit vs dead`);
    lines.push(`        # account), which it can only do if it is reachable.`);
    lines.push(`        continue-on-error: true`);
  }
  lines.push(`        uses: anthropics/claude-code-action@v1`);
  lines.push(`        with:`);
  if (allowedBotsCommentLines) {
    for (const l of allowedBotsCommentLines) lines.push(`          # ${l}`);
  } else {
    lines.push(`          # Cloud fires this as the DispatchSEO GitHub App (a Bot actor), and the App also authored the workflow commits, so scheduled runs are bot-actored too. Every trigger here needs repo write access, so allowing bots is safe; without this claude-code-action aborts with "non-human actor".`);
  }
  lines.push(`          allowed_bots: "${allowedBots}"`);
  lines.push(`          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`);
  lines.push(`          # Pass the standard workflow token as an input so the action uses it`);
  lines.push(`          # directly instead of exchanging OIDC for a Claude GitHub App token`);
  lines.push(`          # (which would require installing the app on the repo).`);
  lines.push(`          github_token: \${{ secrets.GITHUB_TOKEN }}`);
  if (showFullOutput) {
    lines.push(`          # Full transcript in the step log - post-hoc debuggability.`);
    lines.push(`          show_full_output: true`);
  }
  lines.push(`          prompt: |`);
  for (const l of prompt.split("\n")) lines.push(l ? `            ${l}` : "");
  lines.push(`          claude_args: |`);
  lines.push(`            --mcp-config ${mcpConfig}`);
  lines.push(`            --permission-mode bypassPermissions`);
  lines.push(`            --max-turns ${maxTurns}`);
  lines.push(`        env:`);
  for (const key of env) lines.push(ENV_LINES[key]);
  return lines.join("\n");
}

// Where the run's transcript lands, for the private-repo artifact step.
const transcriptPath = `\${{ runner.temp }}/claude-execution-output.json`;

// Classify: how to pull Claude's final message out of what the action left
// behind. The action hides the transcript (these logs can be public) and
// writes an execution log instead.
const classifyMsgExtraction = `            f="$RUNNER_TEMP/claude-execution-output.json"
            if [ -f "$f" ]; then
              msg=$(jq -r 'if type=="array" then .[] else . end
                           | select(.type? == "result")
                           | (.result // .error // empty)' "$f" 2>/dev/null | tail -1)
            fi`;

// Classify: what a non-success outcome MEANS for Claude. A subscription usage
// limit is a deferral, not a failure - and the wording list is pinned to
// cron-alerts.ts's CUSTOMER_ACTIONABLE by scripts/pipeline-pack-lint.mjs, so
// the two copies of that fact cannot drift apart again (2026-08-02).
function classifyBranch() {
  return `          if [ "$AGENT" = "claude" ]; then
            # A subscription usage limit is a deferral, not a failure: the
            # backend keeps the job due and re-dispatches it within hours.
            #
            # Match every wording the subscription actually emits, not just the
            # one we thought of. "You've hit your session limit · resets 1:50pm
            # (UTC)" contains none of usage-limit/limit-reached/rate-limit, so
            # it fell through to fail() - turning "come back in an hour" into a
            # red banner and an alert email, and leaving the build to sit
            # in_progress until the stuck-build sweep freed it hours later.
            # cron-alerts.ts (CUSTOMER_ACTIONABLE) already knew the phrase; this
            # copy is the one that decides defer-vs-fail, so keep them in step -
            # pipeline-pack-lint.mjs fails the build if this drifts again.
            if echo "$msg" | grep -qiE 'session limit|usage limit|limit reached|limit .*resets|rate.?limit'; then
              defer "Claude hit a usage limit this run - the dashboard keeps this build due and re-dispatches it within a few hours. Not a failure."
            fi
            reason="workflow failed (no error detail captured)"
            [ -n "$msg" ] && reason="$msg"
            fail "$reason"
          fi`;
}

// The lean classify (non-builder workflows) has no Claude branch at all: a
// Claude failure there keeps its existing loud path, deliberately.
const basicClassifyBranch = null;

// token-check: a Claude OAuth token can only be proven by using it, so
// liveness is one minimal model call.
function livenessStep() {
  return `      # One minimal model call. If the token is dead/revoked/limited, this
      # step fails and the failure handler below reports the real reason.
      - name: Claude token liveness
        id: liveness
        if: steps.agent.outputs.agent == 'claude'
        uses: anthropics/claude-code-action@v1
        with:
          # Cloud fires this as the DispatchSEO GitHub App (a Bot actor), and the App also authored the workflow commits, so scheduled runs are bot-actored too. Every trigger here needs repo write access, so allowing bots is safe; without this claude-code-action aborts with "non-human actor".
          allowed_bots: "*"
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: \${{ secrets.GITHUB_TOKEN }}
          prompt: "Reply with exactly: ok"
          claude_args: |
            --max-turns 1`;
}

// token-check: how the failure-report step words a dead Claude credential.
const livenessFailureSnippet = `            f="$RUNNER_TEMP/claude-execution-output.json"
            if [ -f "$f" ]; then
              msg=$(jq -r 'if type=="array" then .[] else . end
                           | select(.type? == "result")
                           | (.result // .error // empty)' "$f" 2>/dev/null | tail -1)
              [ -n "$msg" ] && reason="Claude token check failed: $msg"
            fi
            fix="mint a fresh token (claude setup-token) and re-run the setup command from your DispatchSEO dashboard"`;

export default {
  id,
  isDefault: true,
  secretName,
  resolveEnvName,
  resolveCaseArm,
  configSteps,
  invokeStep,
  transcriptPath,
  classifyMsgExtraction,
  classifyBranch,
  basicClassifyBranch,
  livenessStep,
  livenessFailureSnippet,
};
