// Vercel "Ignored Build Step": exit 0 to SKIP the build, exit 1 to RUN it.
//
// Every push used to cost a build. On Hobby that was free; on Pro a build is
// real money (Standard is $0.014/CPU-minute), and a day of docs and workflow
// commits was buying nothing but identical deploys. This skips the build when
// a commit cannot possibly change what gets served.
//
// The rule is an ALLOWLIST of inert paths and it fails toward building: a path
// nobody listed, a git command that errors, a ref that will not resolve - all
// of those build. A wrong skip is the expensive mistake, because it is silent.
// The commit looks pushed, the deployment never happens, and the next person to
// notice is a customer.
//
// What is NOT inert, despite looking it (package.json's build script is the
// authority here, so re-read it before adding anything):
//
//   scripts/   generate-pipeline-pack.mjs and generate-setup-sql.mjs both run
//              before `next build`
//   templates/ the source the pipeline pack is generated FROM - skipping it
//              ships customer repos a stale pack
//   supabase/  generate-setup-sql.mjs concatenates the migrations into
//              setup.sql, which the docker stack replays on every boot

import { execFileSync } from "node:child_process";

const INERT_DIRS = [
  ".github/",
  ".claude/",
  ".claude-plugin/",
  ".dispatchseo/",
  "claude-plugin/",
  "cli/",
  "docker/",
  "docs/", // the app's own docs are src/content/docs - this is SPEC/brand/screenshots
  "skills/",
  "test/",
];

const INERT_FILES = [
  ".dockerignore",
  ".env.docker.example",
  ".env.local.example",
  ".gitattributes",
  ".gitignore",
  "Dockerfile",
  "LICENSE",
  "docker-compose.yml",
  "start.cmd",
  "start.sh",
];

// Root-level prose (CLAUDE.md, README.md, LATER.md, SECURITY.md, ...). Nested
// .md is deliberately not covered - templates/**/*.md ships to customer repos.
const isRootMarkdown = (f) => !f.includes("/") && f.endsWith(".md");

const isInert = (f) =>
  INERT_DIRS.some((d) => f.startsWith(d)) ||
  INERT_FILES.includes(f) ||
  isRootMarkdown(f);

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const build = (why) => {
  console.log(`Building: ${why}`);
  process.exit(1);
};

// Compare against the last commit Vercel actually deployed, not HEAD^. A push
// of several commits only ever builds the tip, so a HEAD^ diff would look at
// one commit and miss the src/ change sitting behind it - skipping a deploy
// that was needed. Falls back to HEAD^ for the single-commit case.
let base = process.env.VERCEL_GIT_PREVIOUS_SHA || "";
try {
  if (base) git("cat-file", "-e", `${base}^{commit}`);
} catch {
  console.log(`Previous deployed sha ${base} not in this clone; using HEAD^`);
  base = "";
}
if (!base) {
  try {
    git("rev-parse", "--verify", "HEAD^");
    base = "HEAD^";
  } catch {
    build("no previous commit to compare against (first build or shallow clone)");
  }
}

let changed;
try {
  changed = git("diff", "--name-only", `${base}..HEAD`).split("\n").filter(Boolean);
} catch (err) {
  build(`could not diff ${base}..HEAD (${err.message.trim().split("\n")[0]})`);
}

if (changed.length === 0) build("no file changes detected");

const material = changed.filter((f) => !isInert(f));
if (material.length > 0) {
  build(`${material.length} of ${changed.length} changed file(s) affect the build, e.g. ${material.slice(0, 3).join(", ")}`);
}

console.log(`Skipping build: all ${changed.length} changed file(s) are inert.`);
for (const f of changed) console.log(`  ${f}`);
process.exit(0);
