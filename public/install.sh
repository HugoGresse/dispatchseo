#!/bin/sh
# DispatchSEO one-line installer:
#
#   curl -fsSL https://dispatchseo.com/install.sh | sh
#
# What it does, in order - each step skips itself if already done:
#   1. Installs Docker if missing (Linux only, via get.docker.com; on Mac
#      and Windows it points you at Docker Desktop instead).
#   2. Fetches the repo into ./dispatchseo (git clone, or a tarball when
#      git isn't installed), or updates an existing clone.
#   3. Runs start.sh, which handles everything else and prints your
#      dashboard URL.
#
# Safe to re-run any time; re-running is also the upgrade command.
set -e

REPO="https://github.com/NeoZi12/dispatchseo"

if ! command -v docker >/dev/null 2>&1; then
  case "$(uname -s)" in
    Linux)
      echo "Docker isn't installed - installing it with Docker's official script..."
      curl -fsSL https://get.docker.com | sh
      ;;
    *)
      echo "Docker isn't installed. Install Docker Desktop first:"
      echo "  https://docs.docker.com/get-docker/"
      echo "then run this command again."
      exit 1
      ;;
  esac
fi

if [ -d dispatchseo/.git ]; then
  echo "Existing install found in ./dispatchseo - updating it."
  # Never let a failed update stop the stack from BOOTING. Under `set -e` a
  # pull that isn't fast-forwardable (a fork with local commits, a hand-edited
  # file, a diverged clone) aborted this script before `sh start.sh` below, so
  # the documented upgrade one-liner left the user's stack down with nothing but
  # a raw git error. start.sh tolerates exactly this for the same reason;
  # GIT_TERMINAL_PROMPT=0 stops a credential prompt hanging an unattended run.
  GIT_TERMINAL_PROMPT=0 git -C dispatchseo pull --ff-only ||
    echo "  Couldn't fast-forward (local changes?) - booting the version that's here."
elif [ -d dispatchseo ]; then
  echo "./dispatchseo exists (tarball install) - refreshing the snapshot."
  curl -fsSL "$REPO/archive/refs/heads/main.tar.gz" | tar xz
  cp -R dispatchseo-main/. dispatchseo/
  rm -rf dispatchseo-main
elif command -v git >/dev/null 2>&1; then
  git clone "$REPO"
else
  echo "git isn't installed - downloading a snapshot instead."
  curl -fsSL "$REPO/archive/refs/heads/main.tar.gz" | tar xz
  mv dispatchseo-main dispatchseo
fi

cd dispatchseo
sh start.sh
