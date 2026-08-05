# Coding agents

DispatchSEO drives a coding agent. It doesn't write anything itself: it holds
the state (the queue, the keywords, the site facts, the stats), it runs the
schedule, and it exposes an MCP server that an agent calls to do the work.

That means "which agent" is a real question with a real answer, and this page
is where the answer lives — including the parts that aren't finished.

## Support tiers

| Tier | What it means | Who verified it |
|---|---|---|
| **1 — Verified** | The maintainer runs it against a credential they hold, and a canary in this repo proves it end to end | maintainer |
| **2 — Community** | A registry entry exists and a contributor demonstrated a real end-to-end run; no maintainer-run canary | contributor |
| **3 — Connect only** | Speaks MCP, so it gets every tool. No headless builder integration. | nobody needs to — it's just MCP |

## Where each agent stands

| Agent | Tier | Connect over MCP | Interactive workflows | Unattended builder | Last verified |
|---|---|---|---|---|---|
| [Claude Code](https://claude.com/claude-code) | 1 | ✅ | ✅ | ✅ GitHub Actions + docker builder | 2026-07-30 |
| [Codex](https://developers.openai.com/codex/cli) | 1 | ✅ | ✅ | ✅ GitHub Actions + docker builder | 2026-07-30 |
| [Cursor](https://cursor.com/cli) | 2 | ✅ | ✅ | ✅ GitHub Actions + docker builder | 2026-08-05 |
| Gemini CLI, Copilot, anything else that speaks MCP | 3 | ✅ | ✅ | ❌ | — |

**Cursor is Tier 2, not Tier 1, and the distinction is the point.** Connecting
is verified end to end against production — all 61 tools, names matching the
registry exactly, nothing dropped by its schema validator, on both the header
and `?key=` auth forms. The builder chain has been run by hand end to end too:
rendered config, approved servers, `cursor-agent -p` calling an MCP tool and
returning `subtype: success`. What has NOT happened is a scheduled, unwatched
run on a real runner. `cursor-canary.yml` is what closes that, and until it has
run green with a real credential this row does not say Tier 1.

Shipping the builder before that is defensible for one specific reason: the
classify path reads `--output-format json`'s `is_error`/`subtype` rather than
guessing from prose, and **every unrecognised subtype falls through to a loud
failure**. The failure mode this project fears — a build reporting green having
built nothing — needs a silent deferral, and there is no silent branch to hit.

Two Cursor-specific facts that shaped all of it, both measured (the long
version is in `docs-private/CURSOR_FACTS.md`):

- **`--output-format json` returns `{is_error, subtype, result, usage}`.** The
  classify step branches on a field rather than grepping warning prose, which
  is why a Cursor builder was safe to write before its quota strings had ever
  been observed. Anything unrecognised still falls through to a loud failure.
- **`.cursor/mcp.json` does not expand `${VAR}`**, and its failure mode is
  disguised: the server reports "not loaded (needs approval)" while
  `mcp enable` says it is approved. Credentials are rendered into the file, the
  same way Codex's TOML renders them.

One consequence for owners rather than contributors: a runner has no browser,
so the builder needs `CURSOR_API_KEY`, and Cursor issues API keys on paid plans
only. Connecting is free on any plan; the unattended builder is Pro-gated in a
way neither Claude Code nor Codex is.

### What "unattended builder" means, and how a project picks one

Two different things are easy to confuse here.

**Connecting** is one paste. The MCP server is one server, the tools are one
tool set, and any client that speaks streamable-HTTP MCP with a bearer token
gets all of them. Nothing about that is Claude-specific, and Codex has been
verified against it: every tool arrives, nothing is dropped by its schema
validator, and it works from a GitHub Actions runner as well as a laptop.

**The unattended builder** is the set of GitHub Actions in your site's repo
(and, on self-host, the docker builder container) that wake up on a schedule
and run an agent with nobody watching. Every `seo-*` workflow template carries
both agents and resolves which to run at run time, by asking the backend
(`/api/project-mode` returns `agent`); the docker builder takes the agent per
job off its poll feed. Switching agent on the dashboard's Settings page is
therefore one column write and takes effect on the next scheduled run — no
repo edit, no reinstall.

That resolution deliberately happens at run time rather than at install time,
for the same reason the pnpm pin does: an install-time edit is a decision
somebody has to remember, and the failure mode when they don't is a builder
that runs the wrong agent every night. `src/lib/agent-settings.ts` is where a
regression on that property would show up.

### What still differs between the two

Capability parity is real, but the two agents are not interchangeable in every
respect, and saying so is cheaper than letting somebody find out from a bill.

- **Who pays.** Claude Code runs on a subscription the owner already has, so
  an overnight build costs nothing extra. Codex is metered by OpenAI per run —
  a nightly build is a recurring charge on the owner's own account. Neither is
  billed by DispatchSEO. The registry's `cost.model` field carries this, and
  every surface that offers the picker shows the note.
- **No turn budget on Codex.** The Claude runner passes `--max-turns 150`, so a
  run that starts going in circles stops itself. Codex has no equivalent flag
  (OpenAI closed the request as not planned), which leaves the job's
  `timeout-minutes` as the only ceiling on a runaway run.
- **Different credential, same two places.** `CLAUDE_CODE_OAUTH_TOKEN` vs
  `OPENAI_API_KEY`, as an Actions repo secret or, on self-host, an encrypted
  dashboard-stored value that `.env` can override. The registry keeps the
  secret name and the env var as separate fields even though they're spelled
  the same today, so a future divergence is a type error rather than a silent
  wrong-credential bug.
- **Credential verification is asymmetric.** An OpenAI key is verified with a
  real inference call before anything stores it — an unfunded account lists
  models it cannot call, so nothing cheaper would reject the key that matters.
  A Claude Code OAuth token can only be validated by running Claude, which the
  server can't do, so that path stays a shape check and the pack's
  `seo-token-check` workflow does the real proving shortly after.
- **Codex needs `default_tools_approval_mode = "approve"`** on its MCP server
  entry, or every tool call is auto-cancelled with nobody there to approve it.
  This is an approval, not a sandbox permission; widening the sandbox does not
  help.
- **Codex connections are not folder-scoped.** There is no `--scope local`
  equivalent — `codex mcp add` always writes the global config. Per-project
  server names keep two sites from colliding, but both are visible from every
  folder unless `CODEX_HOME` is pointed inside the repo.

## Connecting any MCP client

Dashboard → **Settings → Project key** has a tab per agent plus an
**Other MCP client** tab carrying the raw details:

- **Server name:** `dispatchseo-<your-slug>` — unique per project, so several
  connected sites never shadow each other
- **URL:** `https://dispatchseo.com/api/mcp` (or your own origin, self-hosted)
- **Transport:** streamable HTTP
- **Auth:** `Authorization: Bearer <project key>`, or `?key=<project key>` on
  the URL for clients that can't set a header

Both auth forms hit the same gate and see exactly the same data. The bearer
token *is* the tenant: a call made with it can only ever see one project.

## Adding an agent

Agent adapters are the one place in this repo where new surface area is
actively wanted — `CONTRIBUTING.md` is otherwise blunt about unplanned surface
being the most expensive thing you can add.

An agent lives in exactly two source files, and everything else derives:

- **`src/lib/agents/index.ts`** — the runtime registry. One object per agent
  (interface documented in the file): display name, CLI, connect/setup command
  builders, credential story, capabilities, cost model, landing path, mascot
  colour. The dashboard, both onboarding wizards, the MCP `set_agent` tool,
  the instructions placeholders, and the pixel dispatcher all read this — none
  of them branch on agent ids anymore.
- **`scripts/agent-ci/<id>.mjs`** — the CI knowledge (only needed for a
  headless builder, i.e. Tier 1/2). How to validate the credential's shape,
  write the agent's MCP config on a runner, invoke it from a workflow, and
  classify a failed run (deferral vs dead account). The agent-specific blocks
  inside every `templates/pipeline` workflow are GENERATED from these modules
  by `scripts/generate-agent-steps.mjs` — run it after any agent-ci edit and
  commit the regenerated workflows; `pr-check` fails on drift, and also fails
  if the registry and agent-ci disagree on ids or secret names. The pack
  sweep then carries the new blocks into every installed repo on deploy.

No migration is needed: `projects.agent` stopped being CHECK-constrained in
migration 0050, and validation lives in the registry alone.

**Connect-only (Tier 3)** is the registry entry with
`capabilities.headlessBuilder: false` — plus the golden snapshot and a docs
row. **To get past Tier 3** you need:

1. Both files above (registry entry + agent-ci module), regenerated workflows
   and pipeline pack committed.
2. Its commands in the golden snapshot (`scripts/agent-golden.mjs`), so a
   future refactor can't quietly change a paste people rely on.
3. A canary workflow you ran in your own repo, with the run linked (pattern:
   `.github/workflows/codex-canary.yml`), and a facts file recording the CLI's
   measured quirks — config format, approval model, turn-budget story, actor
   gating (pattern: the Codex facts doc those workflow comments cite).
   For self-host parity, `docker/builder/run.sh` (and its Dockerfile's CLI
   install line) carries the same knowledge for the in-stack container — its
   `$agent` branches are the one agent-specific surface not yet generated
   from `scripts/agent-ci/`, so extend them by hand.
4. A row in this file, plus the per-agent user surfaces: an install guide
   (`src/content/docs/install-<id>.mdx`), a landing page wrapper
   (`src/app/<landingPath>/page.tsx` + a `CONTENT` entry in
   `src/app/agent-landing.tsx` + a sitemap line), and an `AgentMark` SVG.
5. **Evidence**: a link to a merged PR on a real site that your agent built.

Requirement 5 is the one that matters. An adapter written by an agent whose
author never actually ran it is exactly the PR the contribution rules exist to
stop, and it's unfakeable here.

Tier 2 entries carry a last-verified date. If nobody re-verifies one within two
release cycles it drops to Tier 3 rather than quietly rotting — that isn't a
punishment, it's the only honest thing to do with a claim nobody is standing
behind.

## Credentials

Every agent credential is bring-your-own and stays with whoever runs the
instance. DispatchSEO never proxies, pools, or resells them — not in cloud, not
in self-host. AGPL covers this code; it does not cover the agent CLIs, and each
vendor's terms are between you and them.

Subscription-backed auth in particular is single-operator only. If you expose a
self-hosted instance to other people, sharing your own subscription auth across
them is the most likely way to breach the provider's terms, and that's your
call to make and your risk to carry.
