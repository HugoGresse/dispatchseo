// The `claude mcp add` snippet shown wherever a project's MCP key surfaces
// (onboarding wizard, pipeline card, settings). The server name is unique per
// project so one owner can connect any number of projects without a second
// project's entry colliding with or shadowing the first one's token. Always
// added at --scope local (pinned to the repo folder it's run in): a global
// (user-scope) connection would leak into every other repo the owner opens
// Claude Code in, so a second project connected elsewhere would silently be
// active there too - the install workflow's repo-remote check would then
// keep rejecting against the wrong project's token. The slug in the name
// also makes "which project is this session talking to" visible in
// `claude mcp list` at a glance.
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
  return `claude mcp add --transport http --scope local ${mcpServerName(slug)} ${origin}/api/mcp --header "Authorization: Bearer ${token}"`;
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
    `${mcpAddCommand(slug, origin, token)}; ` +
    `New-Item -ItemType Directory -Force .claude | Out-Null; ` +
    `if (!(Test-Path .claude/settings.local.json)) { Set-Content .claude/settings.local.json '{ "permissions": { "allow": ["Bash(gh *)"] } }' }`
  );
}

// The one-command onboarding: public/setup.sh checks the folder and tools,
// connects Claude Code, saves every Actions secret (each value verified
// before it is stored), enables PR permissions, and hands off to the
// owner's agent for the pipeline install. Run from inside the site's repo.
// `bundled` (cloud only) skips the script's "does this project use
// DataForSEO?" question entirely - a cloud project never needs its own
// account to get DataForSEO-backed rank checks/research, since the platform
// bills a bundled one server-side; the owner can still connect their own on
// Settings later if they want unmetered usage.
export function setupCommand(slug: string, origin: string, token: string, bundled = false): string {
  return `curl -fsSL ${origin}/setup.sh | bash -s -- ${token} ${slug} ${origin} ${bundled ? "1" : "0"}`;
}

// PowerShell twin of the one-command onboarding. setup.sh is a bash script,
// so on Windows it runs through the bash bundled with Git (already required
// for the repo) - same lookup order start.cmd uses, machine- then user-level
// install.
export function setupCommandPS(slug: string, origin: string, token: string, bundled = false): string {
  return (
    `$b = "$env:ProgramFiles\\Git\\bin\\bash.exe"; ` +
    `if (!(Test-Path $b)) { $b = "$env:LocalAppData\\Programs\\Git\\bin\\bash.exe" }; ` +
    `& $b -c '${setupCommand(slug, origin, token, bundled)}'`
  );
}
