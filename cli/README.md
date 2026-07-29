# dispatchseo CLI

Drive a [DispatchSEO](https://dispatchseo.com) project from **any** coding agent.

```bash
npm install -g dispatchseo
export DISPATCHSEO_TOKEN=<your project key>    # dashboard: Settings -> Project key
dispatchseo get_project
```

Self-hosting? Point it at your own backend:

```bash
export DISPATCHSEO_URL=https://your-dispatchseo-instance
```

## Why a CLI when there is already an MCP server

Every coding agent speaks MCP a little differently — config format, transport,
auth handling, project-vs-global scoping. Every coding agent runs shell commands
identically. So this is the portable door: one command, one env var, and a
[skill](../skills/dispatchseo/SKILL.md) any agent can read.

It is **not** a second API. It is a thin client over the same `/api/mcp`
endpoint the MCP server exposes, with the same bearer token and the same
per-project scoping. If your agent already has the MCP server connected, use
that instead — the tools are identical and named the same.

## Usage

```bash
dispatchseo tools                          # every command this backend offers
dispatchseo describe propose_suggestion    # arguments, types, enums
dispatchseo get_suggestions --status approved
dispatchseo get_rankings --days 30
dispatchseo propose_suggestion --json '{"type":"guide","title":"..."}'
```

Commands are discovered from the server rather than hardcoded, so this CLI never
drifts from your backend's version — a new tool is a new command with no upgrade
needed.

Output is JSON on stdout. Errors go to stderr with a non-zero exit code.

## Requirements

Node 20 or newer. No dependencies.

## Licence

AGPL-3.0, same as the rest of DispatchSEO.
