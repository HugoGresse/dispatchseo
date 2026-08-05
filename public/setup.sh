#!/bin/bash
# DispatchSEO one-command setup.
# Run from INSIDE your website's repo, with the line your dashboard gives you:
#   curl -fsSL https://dispatchseo.com/setup.sh | bash -s -- <project-key> <slug> [backend-url] [bundled] [agent]
#
# What it does, in order: checks your folder + tools, connects your coding
# agent in this folder to your DispatchSEO project, saves the GitHub Actions
# secrets (each value VERIFIED before it is stored), enables PR permissions,
# then hands off to that agent.
#
# Every value is verified before it is saved - this script prefers stopping
# loudly over storing something broken. Reads answers from /dev/tty so it
# works when piped from curl.
#
# AGENT (5th argument, default claude) picks which coding agent gets connected
# and which builder credential is collected. It defaults so that every command
# handed out before this argument existed keeps doing exactly what it did.
# Both agents get the same pipeline: the workflow files carry both and resolve
# which to run from the dashboard at run time.

set -o pipefail

TOKEN="${1:-}"
SLUG="${2:-project}"
BASE="${3:-https://dispatchseo.com}"
BUNDLED="${4:-0}"
AGENT="${5:-claude}"

case "$AGENT" in
  claude) AGENT_CLI="claude";       AGENT_NAME="Claude Code" ;;
  codex)  AGENT_CLI="codex";        AGENT_NAME="Codex" ;;
  cursor) AGENT_CLI="cursor-agent"; AGENT_NAME="Cursor" ;;
  *) printf '\n!! Unknown agent "%s". Supported: claude, codex, cursor.\n\n' "$AGENT"; exit 1 ;;
esac

say() { printf '%s\n' "$*"; }
hr()  { say "-----------------------------------------------"; }
die() { printf '\n!! %s\n\n' "$*"; exit 1; }
ask() { REPLY=""; read -r REPLY < /dev/tty; }

say ""
say "==============================================="
say "  DispatchSEO setup - about 3 minutes"
say "==============================================="
say ""

[ -n "$TOKEN" ] || die "No project key given. Copy the FULL command from your DispatchSEO dashboard - it includes your key."

# ---- 1. Right folder? ------------------------------------------------------
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
  die "This folder is not a git repository. Open a terminal INSIDE your website's repo (the one DispatchSEO publishes to) and run the command again."
ORIGIN_URL=$(git remote get-url origin 2>/dev/null) || \
  die "This repo has no 'origin' remote. cd into your website's GitHub repo and run the command again."
REPO=$(printf '%s' "$ORIGIN_URL" | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')

say "Step 1 of 5 - checking this folder."
say "  Detected repo: $REPO"
say "  Is that your WEBSITE's repo - the one your site deploys from? [y/n]"
ask
[ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ] || \
  die "No problem - cd into the right folder and run the same command again."

# ---- 2. Tools --------------------------------------------------------------
say ""
say "Step 2 of 5 - checking your tools."
if ! command -v "$AGENT_CLI" >/dev/null 2>&1; then
  case "$AGENT" in
    claude) die "Claude Code isn't installed. Install it first (https://claude.com/claude-code), then rerun." ;;
    codex)  die "Codex isn't installed. Install it first (npm i -g @openai/codex, or see https://developers.openai.com/codex/cli), then rerun." ;;
    cursor) die "Cursor's CLI isn't installed. Install it first (curl https://cursor.com/install -fsS | bash), make sure ~/.local/bin is on your PATH, then rerun." ;;
  esac
fi
command -v gh >/dev/null 2>&1 || \
  die "The GitHub CLI (gh) isn't installed. Install it (macOS: brew install gh), run 'gh auth login', then rerun."
gh auth status >/dev/null 2>&1 || \
  die "The GitHub CLI isn't logged in. Run 'gh auth login', then rerun."
say "  All tools present."

# ---- 3. Connect the agent to your project ----------------------------------
say ""
# "in this folder" is Claude's line and stays exactly as it was - it is true
# because of --scope local. Codex must NOT claim it: its config is global, and
# the per-project server name is what keeps two sites apart.
# Cursor joins Claude on the "in this folder" line: its config is
# .cursor/mcp.json, read relative to the directory the agent runs in, so it is
# genuinely folder-scoped. Only Codex has to omit the claim.
if [ "$AGENT" = "codex" ]; then
  say "Step 3 of 5 - connecting $AGENT_NAME to your project."
else
  say "Step 3 of 5 - connecting $AGENT_NAME in this folder to your project."
fi
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":0,"method":"tools/list"}')
[ "$code" = "200" ] || \
  die "Your project key was rejected (HTTP $code). Keys change when a project is recreated - copy the CURRENT command from the dashboard and run it instead."
NAME="dispatchseo-$SLUG"
if [ "$AGENT" = "claude" ]; then
  # --scope local pins this connection to THIS folder. Without it a connection
  # can end up at user scope and leak into every project the owner opens
  # Claude Code in - an owner with several projects connected would then have
  # all of them active at once in an unrelated repo, and the install
  # workflow's repo-remote check would keep failing against the wrong
  # project's token. Scope local on both remove and add so a stray user-scope
  # entry from an older run gets found and cleaned up too.
  claude mcp remove --scope local "$NAME" >/dev/null 2>&1
  claude mcp remove --scope user "$NAME" >/dev/null 2>&1
  # Name immediately after `add`: the CLI's parser is order-fragile
  # (anthropics/claude-code#2341 - options before the name can throw
  # "missing required argument 'name'").
  claude mcp add "$NAME" "$BASE/api/mcp" --transport http --scope local \
    --header "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || \
    die "Could not add the connection to Claude Code (claude mcp add failed)."
elif [ "$AGENT" = "codex" ]; then
  # Codex has no scope flag at all - `codex mcp add` always writes the config
  # Codex calls global. The per-project server NAME is what keeps two projects
  # from shadowing each other, and every prompt we hand the agent names its
  # server literally. No remove step: unlike Claude's, this add overwrites an
  # existing entry of the same name instead of erroring.
  #
  # The key rides in the URL rather than in --bearer-token-env-var, which takes
  # the NAME of an environment variable - that variable would then have to
  # exist in every shell the owner ever launches Codex from, and a missing one
  # fails at tool-call time with nothing pointing at the cause.
  codex mcp add "$NAME" --url "$BASE/api/mcp?key=$TOKEN" >/dev/null 2>&1 || \
    die "Could not add the connection to Codex (codex mcp add failed). Check 'codex --version' - the mcp subcommand needs a recent build."
elif [ "$AGENT" = "cursor" ]; then
  # Cursor has NO `mcp add` command - its whole mcp surface is
  # login/list/list-tools/enable/disable, so connecting means writing the
  # config file. Merged rather than overwritten: .cursor/mcp.json is the
  # owner's file and may already hold other servers.
  mkdir -p .cursor
  command -v node >/dev/null 2>&1 || \
    die "node isn't installed, and Cursor's connection is a JSON file this script edits with it. Install Node (https://nodejs.org), then rerun."
  CURSOR_NAME="$NAME" CURSOR_URL="$BASE/api/mcp" CURSOR_TOKEN="$TOKEN" node -e '
    const fs=require("fs"),f=".cursor/mcp.json";
    const c=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};
    c.mcpServers=c.mcpServers||{};
    c.mcpServers[process.env.CURSOR_NAME]={url:process.env.CURSOR_URL,headers:{Authorization:"Bearer "+process.env.CURSOR_TOKEN}};
    fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n");
  ' >/dev/null 2>&1 || \
    die "Could not write .cursor/mcp.json - check the folder is writable and any existing .cursor/mcp.json is valid JSON."
  # Approval is part of connecting, not an afterthought: an unapproved server
  # is not merely unreachable, it is ABSENT - Cursor starts with zero tools and
  # says "not loaded (needs approval)".
  cursor-agent mcp enable "$NAME" >/dev/null 2>&1 || \
    die "Wrote the connection but could not approve it (cursor-agent mcp enable failed). Run 'cursor-agent mcp enable $NAME' in this folder and rerun."
fi
say "  Connected (key verified against the server)."
[ "$AGENT" = "codex" ] && \
  say "  Tired of approving every call? $BASE/docs/install-codex shows the one config line that stops the prompts for this server."

# Let the agent actually use gh. Claude Code gates terminal commands, and gh
# is not allowed by default - so the install agent's FIRST step (gh auth
# status, the same check this script passed at step 2) gets blocked. That
# block cannot be lifted from the chat: telling the agent "you have my
# permission" never reaches the gate, and the agent correctly refuses to
# grant itself the rule by editing this file. Left to the owner it is a
# dead stop on step one, right after paying. So write it here, where we
# already know they want DispatchSEO driving gh in this repo.
#
# Additive on purpose: an existing settings.local.json belongs to the owner,
# so we merge into it and never clobber it. Without a JSON tool we print the
# line instead of risking their file.
#
# Claude only. Codex has no permissions file to pre-write: it asks for approval
# at the moment it wants to run something and the owner answers, so there is no
# dead stop to prevent - and writing an allowlist for an agent that does not
# read one would be a comforting no-op.
SETTINGS=".claude/settings.local.json"
GH_RULE='Bash(gh *)'
# Only Claude Code has a pre-grantable allowlist file. Codex and Cursor both
# ask at the moment they want to run something, and the owner answers.
[ "$AGENT" = "claude" ] && mkdir -p .claude 2>/dev/null
if [ "$AGENT" != "claude" ]; then
  say "  $AGENT_NAME asks before it runs a command - approve the gh ones when it does."
elif [ ! -f "$SETTINGS" ]; then
  ( printf '%s\n' '{' '  "permissions": {' '    "allow": ["Bash(gh *)"]' '  }' '}' > "$SETTINGS" ) 2>/dev/null \
    && say "  Allowed Claude Code to run gh in this folder ($SETTINGS)." \
    || say "  ! Could not write $SETTINGS - if the agent stalls on a gh command, add \"$GH_RULE\" to its permissions.allow."
elif grep -Fq "$GH_RULE" "$SETTINGS" 2>/dev/null; then
  say "  Claude Code may already run gh here - left $SETTINGS alone."
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$SETTINGS" "$GH_RULE" <<'PY' 2>/dev/null && say "  Allowed Claude Code to run gh in this folder (added to your $SETTINGS)." \
    || say "  ! Could not update $SETTINGS - add \"$GH_RULE\" to permissions.allow yourself if the agent stalls on a gh command."
import json, sys
path, rule = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
if not isinstance(data, dict):
    raise SystemExit(1)
perms = data.setdefault("permissions", {})
allow = perms.setdefault("allow", [])
if not isinstance(allow, list):
    raise SystemExit(1)
if rule not in allow:
    allow.append(rule)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
else
  say "  ! $SETTINGS exists and python3 isn't available to merge into it."
  say "    Add \"$GH_RULE\" to its permissions.allow, or the agent will stall on its first gh command."
fi

# ---- 4. GitHub secrets - every value verified before it is stored ----------
say ""
say "Step 4 of 5 - the GitHub secrets your automations run on."

printf '%s' "$TOKEN" | gh secret set SEO_MCP_API_KEY --repo "$REPO" || \
  die "Could not save a secret to $REPO - does your GitHub login have admin access to it?"
say "  Project key saved."

# The builder credential, per agent. Every one is VERIFIED against the real
# provider before it is stored - the rule everywhere in this script - because
# a saved-but-broken credential reads as "automatic builds are set up" and only
# announces itself as a failed run at 05:13 the next morning.
if [ "$AGENT" = "cursor" ]; then
  say ""
  if gh secret list --repo "$REPO" 2>/dev/null | grep -q "^CURSOR_API_KEY"; then
    say "  A Cursor API key is already saved for this repo."
    say "  Keep it? [y = keep / n = replace with a different one]"
    ask
  else
    REPLY="n"
  fi
  if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
    say ""
    say "  The overnight builds run on a server with no browser, so the login"
    say "  you just used doesn't reach them - they need a Cursor API key, and"
    say "  Cursor issues those on paid plans only. Nothing is billed by"
    say "  DispatchSEO."
    say ""
    say "  Create one in your Cursor dashboard (cursor.com), paste it here and"
    say "  press Enter. It won't be shown:"
    while true; do
      read -r -s CKEY < /dev/tty
      say ""
      CKEY=$(printf '%s' "$CKEY" | tr -d '[:space:]')
      case "$CKEY" in
        "")
          say "  Nothing pasted. Paste the key, or press Ctrl-C to stop and set it later:" ; continue ;;
        sk-ant-*)
          say "  That's a Claude token, not a Cursor key. Paste the Cursor one:" ; continue ;;
        sk-*)
          say "  That's an OpenAI key, not a Cursor key. Paste the Cursor one:" ; continue ;;
      esac
      if [ "${#CKEY}" -lt 20 ]; then
        say "  That looks too short to be a whole key. Copy all of it and paste again:" ; continue
      fi
      # VERIFIED, not just shape-checked. Two measured details make this
      # trustworthy where the obvious version would not be:
      #   - `cursor-agent models` EXITS 0 even when the key is invalid, so the
      #     text is what gets checked, never $?.
      #   - a key set here beats any interactive login already on this machine
      #     (the CLI says so: "The API key was loaded from the CURSOR_API_KEY
      #     environment variable"), so this cannot pass on the owner's own
      #     session the way an unguarded Claude token check can.
      say "  Checking the key with Cursor..."
      OUT=$(CURSOR_API_KEY="$CKEY" cursor-agent models 2>&1)
      case "$OUT" in
        *"Available models"*) break ;;
        *"API key is invalid"*|*"Authentication required"*|*Unauthorized*)
          say "  Cursor rejected that key. Create a fresh one in your Cursor"
          say "  dashboard (an API key needs a paid plan) and paste it again:" ; continue ;;
        *)
          say "  Couldn't check the key - Cursor answered with something"
          say "  unexpected. Paste it again, or Ctrl-C and set it later:" ; continue ;;
      esac
    done
    printf '%s' "$CKEY" | gh secret set CURSOR_API_KEY --repo "$REPO" >/dev/null 2>&1 || \
      die "Could not save CURSOR_API_KEY to $REPO - does your GitHub login have admin access to it?"
    say "  Cursor key verified and saved."
  fi
elif [ "$AGENT" = "codex" ]; then
  say ""
  if gh secret list --repo "$REPO" 2>/dev/null | grep -q "^OPENAI_API_KEY"; then
    say "  An OpenAI key is already saved for this repo."
    say "  Keep it? [y = keep / n = replace with a different one]"
    ask
  else
    REPLY="n"
  fi
  if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
    say ""
    say "  Your builders run on your own OpenAI API key - OpenAI bills you"
    say "  per run, and nothing is billed by DispatchSEO."
    say ""
    say "  Create a key at https://platform.openai.com/api-keys (it must be on"
    say "  an account with credit on it), paste it here and press Enter."
    say "  It won't be shown:"
    while true; do
      read -r -s OKEY < /dev/tty
      say ""
      OKEY=$(printf '%s' "$OKEY" | tr -d '[:space:]')
      case "$OKEY" in
        sk-*)
          [ "${#OKEY}" -gt 20 ] && break
          say "  That looks too short - paste the WHOLE key and press Enter." ;;
        "") say "  Nothing pasted. Copy the key and press Enter." ;;
        *)  say "  An OpenAI key starts with sk-. Copy just the key and press Enter." ;;
      esac
    done
    say "  Verifying the key against OpenAI..."
    # A real inference call, not a models list: an unfunded account happily
    # lists models it cannot call, so anything cheaper than this would pass a
    # key that then fails on the first real build.
    ocode=$(curl -s --max-time 30 -o /tmp/dispatchseo-openai.json -w "%{http_code}" \
      https://api.openai.com/v1/responses \
      -H "Authorization: Bearer $OKEY" -H "Content-Type: application/json" \
      -d '{"model":"gpt-5-mini","input":"ok","max_output_tokens":16}')
    oerr=$(grep -o '"code": *"[^"]*"' /tmp/dispatchseo-openai.json 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    rm -f /tmp/dispatchseo-openai.json
    case "$ocode" in
      2*) printf '%s' "$OKEY" | gh secret set OPENAI_API_KEY --repo "$REPO"
          say "  OpenAI key verified and saved." ;;
      401|403) die "OpenAI rejected that key. Copy it again from platform.openai.com/api-keys - a key is only shown once, so a half-copied one is the usual cause." ;;
      429) die "That key is real but the account can't run anything right now (OpenAI said: ${oerr:-quota exceeded}). Add credit at platform.openai.com/settings/organization/billing, then run this script again." ;;
      *)  die "Couldn't reach OpenAI to verify the key (HTTP $ocode). Check your connection and run this script again." ;;
    esac
  fi
else

# Claude Code token - minted fresh, verified with NO login fallback (a fake
# HOME), because a keychain login otherwise masks a bad token.
CLIP="pbpaste"
if ! command -v pbpaste >/dev/null 2>&1; then
  CLIP="xclip -o -selection clipboard"
  command -v xclip >/dev/null 2>&1 || \
    die "No clipboard tool found. Install xclip (e.g. sudo apt install xclip), then run this script again."
fi
if gh secret list --repo "$REPO" 2>/dev/null | grep -q "^CLAUDE_CODE_OAUTH_TOKEN"; then
  say ""
  say "  A Claude Code token is already saved for this repo."
  say "  Keep it? [y = keep / n = replace with a fresh one]"
  ask
else
  REPLY="n"
fi
if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
  say ""
  say "  Creating your Claude Code token (the builders run on YOUR Claude"
  say "  subscription - nothing is billed by DispatchSEO)."
  say "  Press Enter; a browser opens - click Approve with your normal"
  say "  Claude account."
  ask
  claude setup-token < /dev/tty
  say ""
  hr
  say "  See the long token above (starts with sk-ant-oat)? Select it and"
  say "  copy it (Cmd+C - two lines is fine), then press Enter here."
  while true; do
    ask
    CTOKEN=$($CLIP 2>/dev/null | tr -d '[:space:]')
    case "$CTOKEN" in
      sk-ant-oat*)
        if [ "${#CTOKEN}" -gt 60 ]; then break; fi
        say "  That looks too short - copy the WHOLE token, then press Enter." ;;
      *)
        say "  Your clipboard holds something else. Copy JUST the token, then press Enter." ;;
    esac
  done
  say "  Verifying the token for real (no login fallback)..."
  mkdir -p /tmp/claude-fakehome
  if HOME=/tmp/claude-fakehome CLAUDE_CODE_OAUTH_TOKEN="$CTOKEN" claude -p "reply with just: ok" </dev/null >/dev/null 2>&1; then
    printf '%s' "$CTOKEN" | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo "$REPO"
    say "  Claude token verified and saved."
  else
    die "The token doesn't work - usually the browser approved the WRONG account. Log into your subscription account on claude.ai and run this script again."
  fi
fi

fi  # end of the per-agent builder-credential branch

# DataForSEO - only if this project uses its own account. Cloud projects on
# the bundled plan skip this entirely: the platform bills a DataForSEO
# account server-side, so there is nothing to collect here (the owner can
# still connect their own later, from Settings, for unmetered usage).
if [ "$BUNDLED" = "1" ]; then
  say ""
  say "  DataForSEO is included with your plan - nothing to set up here."
else
  say ""
  say "  Does this project use DataForSEO for keyword data? [y/n]"
  say "  (If you picked the free mode in onboarding, answer n.)"
  ask
  if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
    say ""
    say "  Your DataForSEO LOGIN is your account email. Type it and press Enter:"
    read -r DFS_LOGIN < /dev/tty
    say ""
    say "  Your DataForSEO PASSWORD is the API password from"
    say "  app.dataforseo.com/api-access - NOT your dashboard login password."
    say "  Paste it and press Enter (it won't be shown):"
    read -r -s DFS_PASS < /dev/tty
    say ""
    say "  Verifying against DataForSEO..."
    dfs=$(curl -s --max-time 30 -u "$DFS_LOGIN:$DFS_PASS" https://api.dataforseo.com/v3/appendix/user_data | grep -o '"status_code":20000' | head -1)
    if [ -n "$dfs" ]; then
      printf '%s' "$DFS_LOGIN" | gh secret set DATAFORSEO_LOGIN --repo "$REPO"
      printf '%s' "$DFS_PASS"  | gh secret set DATAFORSEO_PASSWORD --repo "$REPO"
      say "  DataForSEO verified and saved."
    else
      die "DataForSEO rejected those credentials. Double-check: LOGIN = account email, PASSWORD = the API password from app.dataforseo.com/api-access. Then rerun this script."
    fi
  else
    say "  Skipping DataForSEO - the workflows handle its absence cleanly."
  fi
fi

# Allow Actions to open PRs (the builders publish via PRs). The 2026-07-20
# dogfood repo skipped setup.sh, missed this toggle, and its builder wrote a
# whole guide it then couldn't open a PR for - hence the canary below, which
# PROVES the toggle works instead of trusting this call succeeded.
if gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
     -f default_workflow_permissions=write \
     -F can_approve_pull_request_reviews=true >/dev/null 2>&1; then
  say "  GitHub Actions allowed to open pull requests."
else
  say "  ! Couldn't change Actions permissions automatically. In the repo's"
  say "    Settings > Actions > General, enable 'Allow GitHub Actions to"
  say "    create and approve pull requests'."
fi

# Prove the PR machinery end-to-end with a throwaway canary PR (opened from
# inside a workflow, closed by the same run, never merged). Fresh installs
# don't have the workflows yet - the agent's install playbook runs the canary
# after its pipeline PR merges; this path covers re-runs and updates.
if gh workflow run seo-canary.yml --repo "$REPO" >/dev/null 2>&1; then
  say "  Proving workflows can open PRs (canary run, ~30s)..."
  verdict=""
  i=0
  while [ $i -lt 24 ]; do
    sleep 5; i=$((i+1))
    verdict=$(gh run list --repo "$REPO" --workflow seo-canary.yml --limit 1 \
      --json status,conclusion --jq '.[0] | select(.status=="completed") | .conclusion' 2>/dev/null)
    [ -n "$verdict" ] && break
  done
  case "$verdict" in
    success) say "  Canary passed - workflows can build and publish PRs on $REPO." ;;
    "")      say "  ! Canary still running - check its result: gh run list --workflow seo-canary.yml" ;;
    *)       say "  ! CANARY FAILED ($verdict) - workflows cannot open PRs yet. Enable"
             say "    'Allow GitHub Actions to create and approve pull requests' in"
             say "    Settings > Actions > General, then: gh workflow run seo-canary.yml" ;;
  esac
else
  say "  (Canary workflow not in this repo yet - your agent runs it after the"
  say "   pipeline install PR merges.)"
fi

# ---- 5. Hand off to the agent ----------------------------------------------
# $NAME, not "seo-manager": the prompt must name the server exactly as it
# was just registered - agents take the name literally and refuse on a
# name they cannot find.
#
# Both agents install the same pipeline. The workflow files it writes carry
# BOTH agents and resolve which one to run at run time from the dashboard, so
# there is no per-agent install and no decision for the installer to get wrong.
say ""
say "Step 5 of 5 - your agent installs the pipeline (a few minutes; it"
say "opens a pull request and may ask you questions along the way)."
PROMPT="Call the $NAME MCP tool get_instructions with workflow install and follow it exactly."
say ""
say "Launch $AGENT_NAME now to finish? [y/n]"
ask
if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
  exec "$AGENT_CLI" "$PROMPT" < /dev/tty
else
  say ""
  say "==============================================="
  say "  Setup saved. Whenever you're ready, open $AGENT_NAME in this"
  say "  folder and paste:"
  say ""
  say "  $PROMPT"
  say "==============================================="
fi
