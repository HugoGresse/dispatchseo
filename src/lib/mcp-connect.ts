// The connect snippet shown wherever a project's MCP key surfaces (onboarding
// wizard, pipeline card, settings), for every agent that speaks MCP. The server
// name is unique per project so one owner can connect any number of projects
// without a second project's entry colliding with or shadowing the first one's
// token. The slug in the name also makes "which project is this session talking
// to" visible in `claude mcp list` / `codex mcp list` at a glance.
//
// Claude is always added at --scope local (pinned to the repo folder it's run
// in): a global (user-scope) connection would leak into every other repo the
// owner opens Claude Code in, so a second project connected elsewhere would
// silently be active there too - the install workflow's repo-remote check would
// then keep rejecting against the wrong project's token. Codex has no
// equivalent flag; see codexMcpAddCommand for what carries that guarantee
// instead.
//
// Client-safe on purpose: the wizard builds the command in the browser, so
// nothing here may import db.ts or any server-only module.

export function mcpServerName(slug: string): string {
  return `dispatchseo-${slug}`;
}

export function mcpAddCommand(slug: string, origin: string, token: string): string {
  // --transport http is required: without it current Claude Code versions
  // interpret the URL as a stdio command and the connection never works.
  // --scope local pins the connection to the folder this command is run in.
  // Without it, a connection can end up (or get re-added) at user scope and
  // leak into every project the owner opens Claude Code in - so an owner
  // with several projects connected would have every one of them active at
  // once in an unrelated repo, and the install workflow's repo-remote check
  // would keep failing against the wrong project's token.
  // Name comes IMMEDIATELY after `add`: the CLI's parser has a known
  // argument-order bug where options before the name throw "missing
  // required argument 'name'" (anthropics/claude-code#2341; GitHub's own
  // MCP install guide documents the same reorder for Windows).
  return `claude mcp add ${mcpServerName(slug)} ${origin}/api/mcp --transport http --scope local --header "Authorization: Bearer ${token}"`;
}

// Windows variant: the key rides IN THE URL (?key=) instead of a --header.
// Two reasons, both researched and sourced on 2026-07-28: (a) header args
// are the #1 quoting casualty across cmd/PowerShell/the npm .cmd shim, and
// (b) Claude Code on Windows has a long-lived bug where the header is
// stored, `claude mcp list` shows Connected, and actual tool calls send NO
// Authorization header at all (anthropics/claude-code#50464) - a URL
// survives all of it. The gate accepts ?key= for exactly this
// (route.ts authed()). One line, no continuation - neither cmd nor
// PowerShell honors the docs' bash-style trailing backslash.
export function mcpAddCommandPS(slug: string, origin: string, token: string): string {
  return `claude mcp add ${mcpServerName(slug)} "${origin}/api/mcp?key=${token}" --transport http --scope local`;
}

// Lets Claude Code run `gh` in this repo before the install agent's first
// command (`gh auth status`) needs it. Claude Code's auto-mode classifier
// blocks that command by default, and the block can't be lifted from chat -
// "you have my permission" never reaches the gate, and the agent correctly
// refuses to grant itself the rule by editing this file. Chained onto the
// `claude mcp add` paste (via &&) so connecting still takes exactly one
// paste. Additive only: skips if the file already exists, so it never
// clobbers settings the owner already has - same guard `public/setup.sh`
// uses for its curl|bash path.
export function ghPermissionCommand(): string {
  return `mkdir -p .claude && test -f .claude/settings.local.json || printf '%s\\n' '{' '  "permissions": {' '    "allow": ["Bash(gh *)"]' '  }' '}' > .claude/settings.local.json`;
}

// The one paste shown wherever connect + gh permission ship together. Two
// shells because this paste runs on the owner's own machine, where the
// default Windows terminal is PowerShell: `&&`, `test` and `printf` are
// POSIX-only, so Windows gets a native twin instead of a broken paste.
export function connectCommand(slug: string, origin: string, token: string): string {
  return `${mcpAddCommand(slug, origin, token)} && ${ghPermissionCommand()}`;
}

// PowerShell twin: `;` for chaining (PowerShell 5.1 has no `&&`),
// Set-Content for the write (Out-File would emit UTF-16, which JSON
// readers reject), same only-if-missing guard so it never clobbers an
// existing settings file.
export function connectCommandPS(slug: string, origin: string, token: string): string {
  return (
    `${mcpAddCommandPS(slug, origin, token)}; ` +
    `New-Item -ItemType Directory -Force .claude | Out-Null; ` +
    `if (!(Test-Path .claude/settings.local.json)) { Set-Content .claude/settings.local.json '{ "permissions": { "allow": ["Bash(gh *)"] } }' }`
  );
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

/**
 * The MCP endpoint with the project key riding IN the URL.
 *
 * Our gate accepts `?key=` as a first-class equivalent of the Authorization
 * header (route.ts authed()) - it exists because Claude Code on Windows stores
 * a --header and then sends no Authorization at all
 * (anthropics/claude-code#50464). Codex reuses it for a different reason: its
 * only header-free alternative is `--bearer-token-env-var`, which takes the
 * NAME of an environment variable rather than a token, so the connect command
 * stops being self-contained - the variable has to be exported in every shell
 * the owner ever launches Codex from, and a missing one fails at tool-call time
 * with no hint about why. A URL is one paste that keeps working.
 */
export function mcpUrlWithKey(origin: string, token: string): string {
  return `${origin}/api/mcp?key=${token}`;
}

/**
 * Codex's connect command. Deliberately identical on bash and PowerShell:
 * there is no header to quote and no chaining, which is the whole reason this
 * form was chosen (see mcpUrlWithKey).
 *
 * No scope flag exists. `codex mcp add` always writes $CODEX_HOME/config.toml,
 * which Codex calls global - verified against codex-cli 0.146.0, not read off a
 * blog. So the isolation that `--scope local` gives Claude is carried here
 * entirely by the per-project server NAME: two projects connected on one
 * machine get two entries that never shadow each other, and every prompt we
 * hand the agent names its server literally. What does NOT survive is folder
 * scoping - every connected project is visible in every repo. An owner who
 * wants Claude's exact guarantee sets CODEX_HOME per repo; that is a documented
 * option, not the happy path, because it costs an env var in every shell.
 *
 * Re-running is safe: unlike `claude mcp add`, Codex overwrites an existing
 * entry of the same name rather than erroring, so no remove step is needed.
 */
export function codexMcpAddCommand(slug: string, origin: string, token: string): string {
  return `codex mcp add ${mcpServerName(slug)} --url "${mcpUrlWithKey(origin, token)}"`;
}

/**
 * Codex's twin of connectCommand. Claude's version chains a gh permission
 * pre-grant onto the connect, because Claude Code's classifier blocks `gh` and
 * the block cannot be lifted from chat - a dead stop on the install agent's
 * first command. Codex has no such file: it asks for approval at the moment it
 * wants to run something, and the owner answers. So the connect really is just
 * the one line, on both shells.
 */
export function codexConnectCommand(slug: string, origin: string, token: string): string {
  return codexMcpAddCommand(slug, origin, token);
}

export function codexConnectCommandPS(slug: string, origin: string, token: string): string {
  return codexMcpAddCommand(slug, origin, token);
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

/**
 * Cursor has NO `mcp add` command. Its entire `cursor-agent mcp` surface is
 * login / list / list-tools / enable / disable - measured against
 * cursor-agent 2026.07.23-e383d2b, not read off documentation, which is
 * exactly why: an `mcp add` paste would have failed for every owner who ran
 * it. Connecting means writing `.cursor/mcp.json` yourself.
 *
 * Two consequences shape the commands below.
 *
 * 1. **The write MUST merge.** `.cursor/mcp.json` is the owner's file and may
 *    already hold other MCP servers; a blind write is silent data loss on
 *    someone else's config. Both shells read-modify-write instead.
 * 2. **A written server is not a connected server.** Cursor holds an approval
 *    list, and a fresh entry reports `not loaded (needs approval)` until it is
 *    approved - the same class of trap as Codex's approval mode. `mcp enable`
 *    is therefore part of connecting, not an afterthought, and it is what
 *    makes `cursor-agent mcp list` say `ready`.
 *
 * Unlike Codex, the config is genuinely PROJECT-scoped (`.cursor/mcp.json`
 * relative to the folder the agent runs in), so Cursor gets the folder
 * isolation `--scope local` gives Claude, with no global write and no
 * CURSOR_HOME dance.
 */
export function cursorMcpAddCommand(slug: string, origin: string, token: string): string {
  const name = mcpServerName(slug);
  // node, not jq: every repo this pipeline installs into is a Node project, and
  // jq is not on a stock macOS or Windows box. Single-quoted so the shell hands
  // the script to node untouched; the script itself uses only double quotes.
  const script =
    `const fs=require("fs"),f=".cursor/mcp.json";` +
    `const c=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};` +
    `c.mcpServers=c.mcpServers||{};` +
    `c.mcpServers["${name}"]={url:"${origin}/api/mcp",headers:{Authorization:"Bearer ${token}"}};` +
    `fs.writeFileSync(f,JSON.stringify(c,null,2)+"\\n")`;
  return `mkdir -p .cursor && node -e '${script}' && cursor-agent mcp enable ${name}`;
}

/**
 * PowerShell twin. Same merge, same approval, two deliberate differences:
 *
 * - the key rides in the URL (`?key=`) rather than a header, for the reason
 *   Claude's Windows variant does it - nested quoting is the #1 casualty when
 *   PowerShell hands arguments to a native executable, and our gate treats
 *   `?key=` as a first-class equivalent (route.ts authed());
 * - the JSON is built with PowerShell's own ConvertTo-Json rather than by
 *   shelling into node, which would reintroduce exactly that quoting problem.
 *
 * Add-Member -Force is the 5.1-compatible way to add or replace a property on
 * the parsed object, so re-running overwrites this project's entry and leaves
 * every other server alone. Set-Content, not Out-File: Out-File emits UTF-16,
 * which JSON readers reject - the same trap connectCommandPS documents.
 */
export function cursorMcpAddCommandPS(slug: string, origin: string, token: string): string {
  const name = mcpServerName(slug);
  return (
    `New-Item -ItemType Directory -Force .cursor | Out-Null; ` +
    `$f = ".cursor/mcp.json"; ` +
    `$c = if (Test-Path $f) { Get-Content $f -Raw | ConvertFrom-Json } else { New-Object PSObject }; ` +
    `if (-not $c.mcpServers) { $c | Add-Member -Force -MemberType NoteProperty -Name mcpServers -Value (New-Object PSObject) }; ` +
    `$c.mcpServers | Add-Member -Force -MemberType NoteProperty -Name "${name}" ` +
    `-Value ([pscustomobject]@{ url = "${mcpUrlWithKey(origin, token)}" }); ` +
    `$c | ConvertTo-Json -Depth 10 | Set-Content $f; ` +
    `cursor-agent mcp enable ${name}`
  );
}

/**
 * Cursor's connect paste. Like Codex and unlike Claude, there is no gh
 * permission file to pre-grant: Cursor asks for approval when it wants to run
 * something and the owner answers, so the connect really is just the write and
 * the approval.
 */
export function cursorConnectCommand(slug: string, origin: string, token: string): string {
  return cursorMcpAddCommand(slug, origin, token);
}

export function cursorConnectCommandPS(slug: string, origin: string, token: string): string {
  return cursorMcpAddCommandPS(slug, origin, token);
}

// ---------------------------------------------------------------------------
// Any other MCP client
// ---------------------------------------------------------------------------

/**
 * The raw connection details, for a client we have no command for - Gemini
 * CLI, Copilot, an editor plugin, something that hasn't shipped yet.
 *
 * This is what makes "works with your agent" true without a per-agent
 * integration: the server is the same server, the tools are the same tools, and
 * anything that can speak streamable HTTP MCP with a bearer token gets the full
 * dashboard-parity tool set. It buys the connection only - no headless builder,
 * which is a separate thing an agent has to be wired into.
 */
export function genericMcpConfig(
  slug: string,
  origin: string,
  token: string,
): { name: string; url: string; transport: string; header: string; urlWithKey: string } {
  return {
    name: mcpServerName(slug),
    url: `${origin}/api/mcp`,
    transport: "http",
    header: `Authorization: Bearer ${token}`,
    // For clients that cannot set a header at all. Same gate, same access.
    urlWithKey: mcpUrlWithKey(origin, token),
  };
}

// The one-command onboarding: public/setup.sh checks the folder and tools,
// connects the owner's coding agent, saves every Actions secret (each value
// verified before it is stored), enables PR permissions, and hands off to that
// agent for the pipeline install. Run from inside the site's repo.
// `bundled` (cloud only) skips the script's "does this project use
// DataForSEO?" question entirely - a cloud project never needs its own
// account to get DataForSEO-backed rank checks/research, since the platform
// bills a bundled one server-side; the owner can still connect their own on
// Settings later if they want unmetered usage.
//
// `agent` is appended ONLY when it isn't the default. setup.sh defaults its
// fifth argument to claude, so this keeps every Claude paste byte-for-byte what
// it has always been - including the ones owners have already saved in a notes
// file - and the golden snapshot proves it.
export function setupCommand(
  slug: string,
  origin: string,
  token: string,
  bundled = false,
  agent = "claude",
): string {
  const suffix = agent === "claude" ? "" : ` ${agent}`;
  return `curl -fsSL ${origin}/setup.sh | bash -s -- ${token} ${slug} ${origin} ${bundled ? "1" : "0"}${suffix}`;
}

// PowerShell twin of the one-command onboarding. setup.sh is a bash script,
// so on Windows it runs through the bash bundled with Git (already required
// for the repo) - same lookup order start.cmd uses, machine- then user-level
// install.
export function setupCommandPS(
  slug: string,
  origin: string,
  token: string,
  bundled = false,
  agent = "claude",
): string {
  return (
    `$b = "$env:ProgramFiles\\Git\\bin\\bash.exe"; ` +
    `if (!(Test-Path $b)) { $b = "$env:LocalAppData\\Programs\\Git\\bin\\bash.exe" }; ` +
    `if (!(Test-Path $b)) { "Git (with Git Bash) is required - install it from https://git-scm.com/downloads/win and run this again" } else { & $b -c '${setupCommand(slug, origin, token, bundled, agent)}' }`
  );
}
