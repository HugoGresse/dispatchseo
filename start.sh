#!/bin/sh
# One-command boot for the self-hosted docker stack. Safe to re-run any
# time - every step checks before it writes. Quickstart:
#
#   git clone https://github.com/NeoZi12/dispatchseo && cd dispatchseo && sh start.sh
#
# What it does: creates .env from the example on first run, generates the
# one required secret, picks a free host port (4005, or the next port up
# if something like a dev server already holds it), then docker compose
# up. Full guide: docs/SELF_HOSTING.md
set -e

# start.sh is also the upgrade command, and the stack is not only images:
# docker-compose.yml, setup.sql (the migrate container mounts it from this
# folder), and this script itself all live in the repo. Refresh the repo
# first, then hand off to the fresh copy of this script (exec, so a changed
# start.sh never runs half-old half-new). Forks with local commits, tarball
# installs, and offline machines fail the ff-only pull quietly and boot
# what they have; GIT_TERMINAL_PROMPT=0 keeps a credential prompt from
# hanging an unattended run.
if [ -z "$DISPATCHSEO_PULLED" ] && [ -d .git ] && command -v git >/dev/null 2>&1; then
  GIT_TERMINAL_PROMPT=0 git pull --ff-only --quiet 2>/dev/null || true
  DISPATCHSEO_PULLED=1
  export DISPATCHSEO_PULLED
  exec sh "$0"
fi

[ -f .env ] || cp .env.docker.example .env

# Notepad (and friends) save CRLF, and docker compose reads .env raw - a \r
# inside any value poisons whatever consumes it (a domain with \r breaks
# caddy, a port with \r breaks the probe). Normalize the whole file once
# per boot so hand-edits on Windows can never wedge the stack.
if grep -q "$(printf '\r')" .env 2>/dev/null; then
  tr -d '\r' < .env > .env.crlf-fix && mv .env.crlf-fix .env
fi

# The one required secret. Generated once; re-runs keep the existing value.
# /dev/urandom fallback: a box without openssl must not write an empty
# secret (set -e does not catch a failed $(...) inside echo).
if ! grep -q '^CRON_SECRET=..*' .env; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET=$(openssl rand -hex 24)
  else
    SECRET=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  [ -n "$SECRET" ] || { echo "Could not generate CRON_SECRET (no openssl, no /dev/urandom)"; exit 1; }
  echo "CRON_SECRET=$SECRET" >> .env
fi

# Host port for the dashboard. An explicit DISPATCH_PORT in .env always
# wins; otherwise probe from 4005 upward and take the first free port.
# "Connection refused" (curl exit 7) is the free signal - anything that
# answers or hangs means the port is taken. Without curl, stay on 4005.
# tr -d '\r': a Windows owner hand-editing .env in Notepad saves CRLF, and
# a carried \r poisons the value ("4005\r" breaks the probe URL, a domain
# with \r breaks caddy). Same guard on DOMAIN below.
PORT=$(grep '^DISPATCH_PORT=..*' .env | tail -1 | cut -d= -f2 | tr -d '\r')
if [ -z "$PORT" ]; then
  PORT=4005
  if command -v curl >/dev/null 2>&1; then
    while [ "$PORT" -lt 4100 ]; do
      rc=0
      curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT" || rc=$?
      if [ "$rc" -eq 7 ]; then break; fi
      PORT=$((PORT + 1))
    done
  fi
  echo "DISPATCH_PORT=$PORT" >> .env
fi

# APP_URL follows the chosen port. Written outside the port block above:
# a hand-pinned DISPATCH_PORT used to skip it, leaving the compose default
# pointing at 4005 while the dashboard actually served on the pinned port.
if ! grep -q '^APP_URL=..*' .env; then
  echo "APP_URL=http://localhost:$PORT" >> .env
fi

# A DOMAIN in .env turns on the bundled HTTPS proxy (the caddy service):
# certificates fetch and renew themselves, APP_URL follows the domain, and
# nothing needs installing on the host. Needs the domain's DNS A record
# pointing at this machine, with ports 80/443 reachable.
DOMAIN=$(grep '^DOMAIN=..*' .env | tail -1 | cut -d= -f2 | tr -d '\r')
PROFILE=""
if [ -n "$DOMAIN" ]; then
  PROFILE="--profile domain"
  # (|| true: grep -v exits 1 when nothing survives the filter, and set -e
  # would abort the whole boot over an .env that only held APP_URL.)
  { grep -v '^APP_URL=' .env || true; } > .env.new && mv .env.new .env
  echo "APP_URL=https://$DOMAIN" >> .env
fi

# Prefer the prebuilt images (published to GHCR by CI) - first boot becomes
# a download instead of a Next.js compile, which matters on small VPSes.
# Anything that can't pull lands on the local build automatically: modified
# forks (set BUILD_FROM_SOURCE=1 in .env to force it), offline machines, or
# a private repo phase. --build on the fallback keeps upgrades honest:
# "git pull && sh start.sh" always runs the code you just pulled.
if ! grep -q '^BUILD_FROM_SOURCE=1' .env 2>/dev/null \
  && docker compose $PROFILE pull --quiet app builder >/dev/null 2>&1; then
  docker compose $PROFILE up -d --no-build
else
  docker compose $PROFILE up -d --build
fi

echo '
  DispatchSEO is running.
'
if [ -n "$DOMAIN" ]; then
  echo "  Next step -> open  https://$DOMAIN  in your browser."
  echo '  (a fresh certificate can take a minute after DNS lands - just refresh)'
else
  echo "  Next step -> open  http://localhost:$PORT  in your browser."
  echo "
  (on a VPS? localhost means the server itself - give the dashboard a real
   address instead: add DOMAIN=dispatch.your-domain.com to .env and re-run
   sh start.sh. Guide: https://dispatchseo.com/docs/vps)"
fi
echo '  The setup wizard takes it from there.

  (first boot can take ~20 seconds before the page answers - just refresh)
'
