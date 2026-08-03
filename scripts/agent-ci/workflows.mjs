// Per-workflow parameters for the generated agent blocks - everything that
// legitimately differs between the pipeline workflows, spelled out rather than
// inferred. The task prompts live in prompts.json (one copy per workflow; both
// agents' invoke steps are generated from the same text).
//
// Env token names resolve against each agent module's ENV_LINES table, in the
// order listed here.

export const WORKFLOWS = {
  "seo-daily.yml": {
    job: "seo-daily",
    guardIf: "steps.guard.outputs.open == '0'",
    resolve: { variant: "default", announce: "Building with: $agent" },
    run: {
      invokeName: "Run the SEO builder",
      maxTurns: 150,
      showFullOutput: false,
      mcpConfig: "./.github/mcp-ci.json",
      claudeEnv: ["agentToken", "seoKey", "dataforseo", "githubToken", "mcpTimeout", "placeholders"],
      codexEnv: ["seoKey", "dataforseo", "githubToken", "ghToken", "placeholders"],
      artifact: true,
      classify: {
        kind: "full",
        prLabel: "seo",
        failPrefix: "SEO builder",
        successCommentLines: [
          "SUCCESS has to be SHOWN, not asserted. The guard above proved there",
          "were zero open SEO PRs when this run started, so a completed build",
          "leaves exactly one behind. Without this, an agent that exits 0",
          "having built nothing reports ok, which resets the 20h cadence",
          "window and costs the day silently - the exact shape seen on",
          "2026-07-31, when Codex hit a file-writing wall, stopped to ask a",
          "human for a go/no-go, and exited clean. There is no human on a",
          "scheduled runner. The in-stack docker builder has had this check",
          "since the same day; this is its twin, and its absence here is why",
          "the Actions half stayed silent.",
          "",
          "Reported as `deferred`, never `fail`: a clean no-PR exit is also",
          "what the thin-content and sameness gates do when they reject an",
          "idea, and that is correct behaviour rather than breakage. Deferred",
          "keeps the job due so the next dispatch picks up the next",
          "suggestion, and only goes stale and alarms if runs keep producing",
          "nothing.",
        ],
        noPrDefer:
          "The builder finished but opened no PR, so nothing was built this run. The job stays due and gets retried. If this repeats, read the run log above - an agent that stops to ask a question builds nothing, and an unattended run has nobody to answer it.",
      },
    },
  },

  "seo-tools.yml": {
    job: "seo-tools",
    guardIf: "steps.guard.outputs.open == '0'",
    resolve: { variant: "default", announce: "Building with: $agent" },
    run: {
      invokeName: "Run the SEO tool builder",
      maxTurns: 150,
      showFullOutput: true,
      mcpConfig: "./.github/mcp-ci.json",
      claudeEnv: ["agentToken", "seoKey", "dataforseo", "githubToken", "mcpTimeout", "placeholders"],
      codexEnv: ["seoKey", "dataforseo", "githubToken", "ghToken", "placeholders"],
      artifact: false,
      classify: {
        kind: "full",
        prLabel: "seo-tool",
        failPrefix: "SEO tool builder",
        successCommentLines: [
          "SUCCESS has to be SHOWN: the guard proved zero open tool PRs when",
          "this run started, so a completed build leaves exactly one behind.",
          "Deferred rather than failed - the SERP gate and the value bar",
          "legitimately reject ideas without a PR, and the stuck-build sweep",
          "reverts the in_progress row so the next dispatch tries the queue",
          "again.",
        ],
        noPrDefer:
          "The tool builder finished but opened no PR, so nothing was built this run. The job stays due and gets retried. If this repeats, read the run log - an agent that stops to ask a question builds nothing, and an unattended run has nobody to answer it.",
      },
    },
  },

  "seo-geo-scan.yml": {
    job: "seo-geo-scan",
    guardIf: "steps.guard.outputs.skip == '0'",
    resolve: { variant: "default", announce: "Building with: $agent" },
    run: {
      invokeName: "Run the geo scan",
      maxTurns: 120,
      showFullOutput: true,
      mcpConfig: "./.github/mcp-ci.json",
      claudeEnv: ["agentToken", "seoKey", "mcpTimeout"],
      codexEnv: ["seoKey", "ghToken"],
      artifact: false,
      classify: { kind: "basic" },
    },
  },

  "seo-setup.yml": {
    job: "seo-setup",
    guardIf: null,
    resolve: { variant: "setup", announce: "Building with: $agent" },
    run: {
      invokeName: "Run setup",
      maxTurns: 150,
      showFullOutput: true,
      mcpConfig: "./.github/mcp-ci.json",
      claudeEnv: ["agentToken", "seoKey", "dataforseo", "mcpTimeout"],
      codexEnv: ["seoKey", "dataforseo", "ghTokenCommented"],
      artifact: false,
      classify: { kind: "basic" },
    },
  },

  "seo-trend-expand.yml": {
    job: "seo-trend-expand",
    guardIf: null,
    resolve: { variant: "default", announce: "Building with: $agent" },
    run: {
      invokeName: "Expand the picked subject into takes",
      maxTurns: 100,
      showFullOutput: true,
      mcpConfig: "./.github/mcp-ci.json",
      claudeEnv: ["agentToken", "seoKey", "dataforseo", "mcpTimeout"],
      codexEnv: ["seoKey", "dataforseo", "ghToken"],
      artifact: false,
      classify: { kind: "basic" },
    },
  },

  "seo-trend-scan.yml": {
    job: "seo-trend-scan",
    guardIf: null,
    resolve: { variant: "default", announce: "Building with: $agent" },
    run: {
      invokeName: "Run the trend scan",
      maxTurns: 100,
      showFullOutput: true,
      mcpConfig: "./.github/mcp-ci.json",
      claudeEnv: ["agentToken", "seoKey", "dataforseo", "mcpTimeout"],
      codexEnv: ["seoKey", "dataforseo", "ghToken"],
      artifact: false,
      classify: { kind: "basic" },
    },
  },

  "seo-weekly-research.yml": {
    job: "seo-weekly-research",
    guardIf: "steps.guard.outputs.skip == '0'",
    resolve: { variant: "default", announce: "Building with: $agent" },
    run: {
      invokeName: "Run the SEO researcher",
      maxTurns: 120,
      showFullOutput: true,
      mcpConfig: "./.github/mcp-ci.json",
      claudeEnv: ["agentToken", "seoKey", "dataforseo", "mcpTimeout"],
      codexEnv: ["seoKey", "dataforseo", "ghToken"],
      artifact: false,
      classify: { kind: "basic" },
    },
  },

  "seo-tool-validate.yml": {
    job: "seo-tool-validate",
    guardIf: null,
    resolve: { variant: "vars", announce: "Validating with: $agent" },
    run: {
      variant: "validate",
      invokeName: "Validate the tool live",
      maxTurns: 140,
      showFullOutput: true,
      mcpConfig: "./.github/mcp-validate.json",
      allowedBots: "github-actions",
      allowedBotsCommentLines: [
        "Tool PRs are opened and pushed by the builder workflow, so the",
        "triggering actor is github-actions[bot]; without this the action",
        "refuses to start (\"non-human actor\") and the PR never gets a",
        "verdict. Same-repo + seo-tool label gates above still apply.",
      ],
      claudeEnv: ["agentToken", "githubToken", "ghToken", "prNumber"],
      codexEnv: ["githubToken", "ghToken", "prNumber"],
      artifact: false,
      classify: null,
      continueOnError: false,
      endAnchor: "      # NO report step here",
    },
  },

  "seo-token-check.yml": {
    job: "seo-token-check",
    guardIf: null,
    resolve: { variant: "token-check", announce: "Checking the $agent credential." },
    liveness: true,
  },
};
