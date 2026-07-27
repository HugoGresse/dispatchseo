#!/bin/sh
# DispatchSEO in-stack builder loop. Polls /api/builder/jobs on the app
# container, executes each returned job with headless Claude Code inside a
# clone of the site's repo, sweeps green guide PRs for auto-merge projects,
# and reports every outcome to the same cron_runs rails the dashboard
# banner and alert emails read. POSIX sh - keep it boring.
#
# Env (set via docker-compose from .env):
#   CRON_SECRET              required - authenticates against the backend
#   CLAUDE_CODE_OAUTH_TOKEN  required for builds - from `claude setup-token`
#   BUILDER_GH_TOKEN         optional - overrides the wizard's merge token
#   APP_INTERNAL_URL         default http://app:3000
#   BUILDER_POLL_SECONDS     default 600 (the backend can lower/raise it)

APP="${APP_INTERNAL_URL:-http://app:3000}"
POLL="${BUILDER_POLL_SECONDS:-600}"
mkdir -p /data/repos /data/mcp /data/logs

log() { echo "[builder] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

# A dropped report is not cosmetic: the backend hands jobs out by logging a
# CLAIM row, and only a real outcome supersedes it. If reporting fails, the run
# that actually happened never registers - the dashboard banner and
# get_cron_health stay blind, and the job looks in-flight until the claim grace
# window expires. This used to fail completely silently: the body went to
# /dev/null and `|| true` ate the exit code, so a rejected report (e.g. the
# 40-char job-name cap that every long slug tripped) looked identical to a
# successful one. Still non-fatal by design - a logging failure must never kill
# the builder - but now it SAYS so in the container logs.
report() { # report <job-key> <ok|fail> [message]
  if [ "$2" = "ok" ]; then
    resp=$(curl -sG --max-time 30 -w '\n%{http_code}' -H "Authorization: Bearer ${CRON_SECRET}" \
      --data-urlencode "job=$1" --data-urlencode "ok=1" \
      "${APP}/api/cron/deploy-check" 2>&1) || resp="${resp}
000"
  else
    resp=$(curl -sG --max-time 30 -w '\n%{http_code}' -H "Authorization: Bearer ${CRON_SECRET}" \
      --data-urlencode "job=$1" --data-urlencode "fail=$3" \
      "${APP}/api/cron/deploy-check" 2>&1) || resp="${resp}
000"
  fi
  code=$(printf '%s' "$resp" | tail -n 1)
  case "$code" in
    2*) ;;
    *)
      log "WARN: the dashboard did not accept the outcome report for '$1' (HTTP ${code:-?})."
      log "      This run will not appear on the dashboard or in failure alerts."
      log "      Response: $(printf '%s' "$resp" | head -n 1)"
      ;;
  esac
}

# Clone the repo, or hard-reset an existing clone to the remote's default
# branch. Every job starts from clean origin state; the agent creates its
# own working branch from there.
sync_repo() { # sync_repo <owner/repo> <dir> -> 0/1
  url="https://x-access-token:${GH_TOKEN}@github.com/$1.git"
  if [ ! -d "$2/.git" ]; then
    git clone --quiet "$url" "$2" || return 1
  fi
  git -C "$2" remote set-url origin "$url"
  git -C "$2" fetch --quiet --prune origin || return 1
  git -C "$2" remote set-head origin -a >/dev/null 2>&1
  branch=$(git -C "$2" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
  [ -n "$branch" ] || branch=main
  git -C "$2" checkout --quiet -B "$branch" "origin/$branch" || return 1
  git -C "$2" reset --quiet --hard "origin/$branch"
  git -C "$2" clean -qfd
}

# Last-resort deny-list, kept as a second gate behind the allowlist below.
# The allowlist is what actually decides; this only catches a repo whose
# publish-paths were edited to include something they should not.
DENY='^\.github/|^\.dispatchseo/|(^|/)package\.json$|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|(^|/)\.env|next\.config|vercel\.json|(^|/)tsconfig'

# Path prefixes a guide PR may touch, read from the repo's OWN
# .dispatchseo/publish-paths on the default branch - the same file
# seo-auto-merge.yml reads, so self-host and hosted installs apply the
# identical gate. On a self-hosted backend GitHub cannot reach, that workflow
# never runs (it curls the backend for project mode), which makes this sweep
# the only gate there is - a deny-list would auto-merge anything nobody
# thought to ban. Reference-stack layout is the fallback when the file is
# absent. Fetched per sweep so an owner's edit takes effect without a restart.
publish_prefixes() { # publish_prefixes <owner/repo>
  prefixes=$(gh api "repos/$1/contents/.dispatchseo/publish-paths" \
    -H "Accept: application/vnd.github.raw" 2>/dev/null \
    | grep -v '^[[:space:]]*#' | grep -v '^[[:space:]]*$')
  if [ -z "$prefixes" ]; then
    printf 'src/content/blog/\nsrc/components/blog/\npublic/blog/covers/\n'
  else
    printf '%s\n' "$prefixes"
  fi
}

# 0 when every changed file sits under one of the allowed prefixes. Word
# splitting is fine here: a path containing whitespace simply fails to match
# and the PR goes to the owner, which is the safe direction.
within_publish_paths() { # within_publish_paths <files> <prefixes>
  for f in $1; do
    ok=0
    for p in $2; do
      case "$f" in "$p"*) ok=1; break ;; esac
    done
    [ "$ok" = 1 ] || return 1
  done
  return 0
}

merge_sweep() { # merge_sweep <slug> <owner/repo>
  allowed=$(publish_prefixes "$2")
  gh pr list --repo "$2" --label seo --state open \
    --json number,labels \
    --jq '.[] | select([.labels[].name] | index("seo-tool") | not) | .number' \
  | while read -r n; do
      [ -n "$n" ] || continue
      # Every check green (gh exits 0 only then; pending=8, failing/none=1).
      if ! gh pr checks "$n" --repo "$2" >/dev/null 2>&1; then continue; fi
      changed=$(gh pr diff "$n" --repo "$2" --name-only)
      if ! within_publish_paths "$changed" "$allowed"; then
        log "PR #$n in $2 touches files outside the publish dirs (structural change) - leaving it for the owner"
        continue
      fi
      if echo "$changed" | grep -qE "$DENY"; then
        log "PR #$n in $2 touches protected files - leaving it for the owner"
        continue
      fi
      if gh pr merge "$n" --repo "$2" --squash --delete-branch >/dev/null 2>&1; then
        log "auto-merged green guide PR #$n in $2"
        report "builder-merge--$1" ok
      else
        report "builder-merge--$1" fail "could not merge green PR #$n - merge it on GitHub and check branch protection"
      fi
    done
}

run_job() { # run_job <base64 job json>
  j=$(echo "$1" | base64 -d)
  key=$(echo "$j" | jq -r .key)
  wf=$(echo "$j" | jq -r .workflow)
  slug=$(echo "$j" | jq -r .slug)
  repo=$(echo "$j" | jq -r .repo)
  prompt=$(echo "$j" | jq -r .prompt)
  SEO_MCP_API_KEY=$(echo "$j" | jq -r .mcp_token)
  DATAFORSEO_LOGIN=$(echo "$j" | jq -r '.dataforseo.login // empty')
  DATAFORSEO_PASSWORD=$(echo "$j" | jq -r '.dataforseo.password // empty')
  export SEO_MCP_API_KEY DATAFORSEO_LOGIN DATAFORSEO_PASSWORD

  log "job $key starting (repo $repo)"
  dir="/data/repos/$slug"
  if ! sync_repo "$repo" "$dir"; then
    report "$key" fail "could not clone/sync $repo - check the GitHub token's access to it"
    return
  fi

  # MCP config: seo-manager over the internal docker network; the token
  # rides an env expansion so it never lands on disk. dataforseo joins
  # only when the project has credentials.
  cfg="/data/mcp/$slug.json"
  if [ -n "$DATAFORSEO_LOGIN" ]; then
    jq -n --arg url "$APP/api/mcp" '{mcpServers:{
      "seo-manager":{type:"http",url:$url,headers:{Authorization:"Bearer ${SEO_MCP_API_KEY}"}},
      "dataforseo":{type:"stdio",command:"npx",args:["-y","dataforseo-mcp-server@latest"],
        env:{DATAFORSEO_USERNAME:"${DATAFORSEO_LOGIN}",DATAFORSEO_PASSWORD:"${DATAFORSEO_PASSWORD}",ENABLED_MODULES:"SERP,DATAFORSEO_LABS,BACKLINKS"}}}}' > "$cfg"
  else
    jq -n --arg url "$APP/api/mcp" '{mcpServers:{
      "seo-manager":{type:"http",url:$url,headers:{Authorization:"Bearer ${SEO_MCP_API_KEY}"}}}}' > "$cfg"
  fi

  # Preflight: a dead MCP makes Claude see an empty toolset and "succeed"
  # at nothing (the 2026-07-14 domain-move bug) - refuse to start instead.
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$APP/api/mcp" \
    -H "Authorization: Bearer $SEO_MCP_API_KEY" -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":0,"method":"tools/list"}')
  if [ "$code" != "200" ]; then
    report "$key" fail "seo-manager MCP returned HTTP $code from inside the stack"
    return
  fi

  out="/data/logs/$key.$(date -u +%Y%m%d%H%M%S).json"
  ( cd "$dir" && MCP_TIMEOUT=120000 timeout 5400 \
      claude -p "$prompt" \
        --mcp-config "$cfg" \
        --permission-mode bypassPermissions \
        --max-turns 150 \
        --output-format json > "$out" 2>"$out.err" )
  rc=$?
  msg=$(jq -r 'if type=="array" then .[] else . end | select(.type?=="result") | (.result // .error // empty)' "$out" 2>/dev/null | tail -c 400)
  [ -n "$msg" ] || msg=$(tail -c 400 "$out.err" 2>/dev/null)

  if [ "$rc" = "0" ]; then
    log "job $key done"
    report "$key" ok
  elif echo "$msg" | grep -qiE 'usage limit|limit reached|rate.?limit'; then
    # A usage-limit hit is a deferral, not a failure - the next due window
    # retries, exactly like the cloud workflow's 12:00/19:00 reruns.
    log "job $key deferred - Claude usage limit"
    report "$key" ok
  else
    [ -n "$msg" ] || msg="claude exited $rc (see $out in the dispatch-builder volume)"
    log "job $key FAILED: $msg"
    report "$key" fail "$msg"
  fi
}

log "starting - backend $APP"
# Fallback identity only - overwritten per loop once a GitHub token is known.
# Vercel refuses to deploy commits whose author email maps to no GitHub
# account, so real jobs must commit as the token's user (see set_git_identity).
git config --global user.name "dispatchseo-builder" 2>/dev/null
git config --global user.email "builder@dispatchseo.local" 2>/dev/null
git config --global init.defaultBranch main 2>/dev/null

GIT_ID_TOKEN=""
set_git_identity() { # commit as the GH_TOKEN's real user, cached per token
  [ -n "$GH_TOKEN" ] || return 0
  [ "$GH_TOKEN" = "$GIT_ID_TOKEN" ] && return 0
  me=$(curl -s --max-time 30 -H "Authorization: Bearer ${GH_TOKEN}" https://api.github.com/user)
  login=$(echo "$me" | jq -r '.login // empty')
  uid=$(echo "$me" | jq -r '.id // empty')
  if [ -n "$login" ] && [ -n "$uid" ]; then
    git config --global user.name "$login" 2>/dev/null
    git config --global user.email "${uid}+${login}@users.noreply.github.com" 2>/dev/null
    GIT_ID_TOKEN="$GH_TOKEN"
    log "committing as $login <${uid}+${login}@users.noreply.github.com>"
  else
    log "could not resolve the GitHub user behind the token - commits keep the fallback identity, which Vercel may refuse to deploy"
  fi
}

while :; do
  # A non-claiming poll FIRST: it carries the tokens (gh + claude) and never
  # costs a cadence window, so resolving/validating the Claude token here can
  # never silently claim jobs we then skip for a bad token.
  probe=$(curl -s --max-time 60 -H "Authorization: Bearer ${CRON_SECRET}" "$APP/api/builder/jobs")
  if [ -z "$probe" ] || ! echo "$probe" | jq -e . >/dev/null 2>&1; then
    log "backend not reachable yet - retrying in 60s"
    sleep 60; continue
  fi

  # The Claude Code OAuth token. The container's own env wins (classic
  # installs that set CLAUDE_CODE_OAUTH_TOKEN in .env); otherwise the
  # wizard-stored token the backend just handed us - so owners who paste it
  # on the dashboard's automatic-builds step never touch .env or hunt for the
  # install folder. Poll every 5 min while unconfigured so a freshly pasted
  # token goes live quickly, instead of the long idle a settled builder uses.
  CLAUDE_TOK="${CLAUDE_CODE_OAUTH_TOKEN:-$(echo "$probe" | jq -r '.claude_token // empty')}"
  case "$CLAUDE_TOK" in
    "") log "idle - no Claude token yet. Paste it on the dashboard's 'Turn on automatic builds' step (or set CLAUDE_CODE_OAUTH_TOKEN in .env)."
       sleep 300; continue ;;
    *PASTE-YOUR-TOKEN*) log "idle - the token is still the placeholder; paste the real sk-ant-oat... token on the dashboard's automatic-builds step."
       sleep 300; continue ;;
    sk-ant-oat*) : ;;
    *) log "idle - that doesn't look like a Claude Code OAuth token (expected sk-ant-oat...); re-run 'claude setup-token' and paste it again."
       sleep 300; continue ;;
  esac
  export CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_TOK"

  # Token good - now claim real work.
  feed=$(curl -s --max-time 60 -H "Authorization: Bearer ${CRON_SECRET}" "$APP/api/builder/jobs?claim=1")
  if [ -z "$feed" ] || ! echo "$feed" | jq -e . >/dev/null 2>&1; then
    log "backend not reachable yet - retrying in 60s"
    sleep 60; continue
  fi

  # GitHub identity: the wizard's one-tap-merge token, unless overridden.
  GH_TOKEN="${BUILDER_GH_TOKEN:-$(echo "$feed" | jq -r '.gh_token // empty')}"
  export GH_TOKEN
  set_git_identity

  njobs=$(echo "$feed" | jq '.jobs | length')
  nsweeps=$(echo "$feed" | jq '.merge_sweeps | length')
  if [ -z "$GH_TOKEN" ]; then
    if [ "$njobs" != "0" ]; then
      log "jobs are due but no GitHub token is available - connect one in the wizard's Connect GitHub step, or on Home's 'Connect GitHub' card (or set BUILDER_GH_TOKEN in .env)"
    fi
    # This used to be silent whenever njobs was 0 (the common steady state) -
    # auto-merge being on with no token to actually merge with just sat there
    # invisibly, no docker log line and no cron_runs row, while Home's "Ready
    # to ship" card still claimed "merges on its own, no action needed"
    # unconditionally. Report it as a real failed run so it shows up on the
    # dashboard/get_cron_health like any other broken automation.
    if [ "$nsweeps" != "0" ]; then
      log "auto-merge is on but no GitHub token is available - PRs will not be merged until one is connected"
      echo "$feed" | jq -r '.merge_sweeps[].slug' | while read -r slug; do
        [ -n "$slug" ] || continue
        report "builder-merge--$slug" fail "no GitHub token connected - connect one in the wizard's Connect GitHub step, or on Home's 'Connect GitHub' card (or set BUILDER_GH_TOKEN in .env)"
      done
    fi
  else
    for row in $(echo "$feed" | jq -r '.jobs[] | @base64'); do
      run_job "$row"
    done
    if [ "$nsweeps" != "0" ]; then
      echo "$feed" | jq -r '.merge_sweeps[] | "\(.slug) \(.repo)"' \
      | while read -r slug repo; do merge_sweep "$slug" "$repo"; done
    fi
  fi

  POLL=$(echo "$feed" | jq -r '.poll_seconds // 600')
  sleep "$POLL"
done
