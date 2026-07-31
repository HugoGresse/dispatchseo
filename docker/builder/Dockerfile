# The in-stack builder: a headless coding agent + git + gh, polling the app
# container for due jobs (daily guide, weekly research, tool builds,
# geo-scan) and executing them right next to the backend - the Docker
# replacement for the GitHub-Actions schedules, which cannot call back into
# a localhost instance. All scheduling brains live in the backend
# (/api/builder/jobs); this image is a dumb executor on purpose, so cadence
# and prompt changes never require rebuilding it.
#
# BOTH tier-1 agent CLIs are baked in. That costs image size for something most
# stacks use half of, and it is still the right trade: the agent is a per-PROJECT
# setting, so one stack can legitimately need both at once, and switching a
# project's agent on the dashboard has to work without the owner re-pulling an
# image and reading a migration note to find out why builds stopped.
FROM node:22-bookworm-slim

# python3: not in node:*-slim, and its absence is not cosmetic. Codex writes
# files by shelling out, and a guide is MDX - full of backticks, which bash
# expands as command substitution inside a heredoc. Without python3 the agent
# has no quoting-proof way to write a multi-line file at all, so a build run
# produced nothing and still exited 0 (2026-07-31). Claude Code never hit this
# because it has built-in file tools and never shells out to write.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates jq gnupg python3 \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# corepack gives the agent pnpm/yarn shims for whatever stack the site repo
# uses when the instructions say "run the repo's build to verify".
RUN npm install -g @anthropic-ai/claude-code @openai/codex && corepack enable

COPY run.sh /usr/local/bin/run.sh
# The command Codex reaches for BY NAME when it wants to write a file. It is
# not shipped by @openai/codex (that package installs only codex.js), so
# without this the model's first choice fails and it falls back to the shell
# quoting it cannot survive. python3 above is the belt to this pair of braces.
COPY apply_patch /usr/local/bin/apply_patch
RUN chmod +x /usr/local/bin/apply_patch

# Claude Code refuses permission-bypass as root, same as on CI runners -
# run as the image's unprivileged user, with all state on the /data volume.
# Codex needs a writable home for the same reason: `codex login --with-api-key`
# writes auth.json under CODEX_HOME, which run.sh points at /data per project.
RUN mkdir -p /data && chown -R node:node /data
USER node
ENV HOME=/data
WORKDIR /data

ENTRYPOINT ["/bin/sh", "/usr/local/bin/run.sh"]
