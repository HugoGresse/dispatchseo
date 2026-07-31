// Does the PR a build claims to have produced actually contain the work?
//
// WHY THIS EXISTS, and why it is not another instruction. On 2026-07-31 a Codex
// guide run reported a complete, itemised ship check - "cover present: yes",
// "visuals imported in MDX: 3", "H2 = 4, H3 = 1", "FAQ items: 3, frontmatter
// and body remain aligned" - on a branch whose MDX file was ZERO BYTES and
// whose cover did not exist. Every number was invented. Merging it would have
// blanked a published post.
//
// That run had just been given a stricter playbook telling it to verify its own
// work with commands and report the counts. It reported the counts. The lesson
// is not that the wording needed another pass: an agent's self-report is
// evidence of what it believes it did, and no amount of instruction converts
// belief into fact. The only trustworthy check is one the agent does not
// perform - so this reads the diff from GitHub, server-side, at the moment the
// agent tries to mark the item done.
//
// SCOPE - deliberately narrow. This does not grade content, count visuals or
// judge quality; a check that guesses at what a good guide looks like would
// fire on legitimate PRs across repos we have never seen. It answers one
// question no honest build can fail: did this PR DESTROY something, or change
// nothing at all? Emptying or deleting a file is never part of publishing a
// guide, and it is precisely the damage the fabricated report concealed.
//
// FAIL OPEN on infrastructure, FAIL CLOSED on damage. A GitHub outage, a
// missing token, an unparseable URL - all allow the completion through, because
// blocking builds when we cannot see the diff would strand the pipeline for a
// reason that has nothing to do with the build. A diff we CAN see that empties
// a file is refused, every time.

import { tokenForRef, type RepoRef } from "./github";

const API = "https://api.github.com";

// A "modified" file whose additions are zero has had every line taken out. The
// deletions floor keeps this off genuinely tiny files - trimming a 3-line stub
// is not the failure this catches, and a guide is hundreds of lines.
const EMPTIED_DELETIONS_FLOOR = 10;

export type PrGuardVerdict =
  | { ok: true; checked: boolean }
  | { ok: false; reason: string };

type PrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
};

function parsePrUrl(url: string): { repo: string; number: number } | null {
  const m = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(url);
  if (!m) return null;
  return { repo: m[1], number: Number(m[2]) };
}

/**
 * Check the PR a build is about to be marked done against. Returns ok:true with
 * checked:false when the diff could not be read - the caller should treat that
 * as a pass, not a pass-with-confidence.
 */
export async function checkBuildPr(project: RepoRef, prUrl: string): Promise<PrGuardVerdict> {
  const parsed = parsePrUrl(prUrl);
  if (!parsed) return { ok: true, checked: false };

  let files: PrFile[];
  try {
    const token = await tokenForRef(project);
    if (!token) return { ok: true, checked: false };
    const res = await fetch(`${API}/repos/${parsed.repo}/pulls/${parsed.number}/files?per_page=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "dispatchseo",
      },
      cache: "no-store",
    });
    if (!res.ok) return { ok: true, checked: false };
    files = (await res.json()) as PrFile[];
    if (!Array.isArray(files)) return { ok: true, checked: false };
  } catch {
    return { ok: true, checked: false };
  }

  // Nothing at all. A build that opened a PR containing no changes did not
  // build anything, whatever its report says.
  if (files.length === 0) {
    return {
      ok: false,
      reason:
        `The pull request at ${prUrl} changes no files, so this build produced nothing. ` +
        `Do not mark the suggestion done. Find out what happened to your writes, fix them, ` +
        `push to the same branch, and call update_suggestion again once the PR shows the work.`,
    };
  }

  const emptied = files.filter(
    (f) => f.status === "modified" && f.additions === 0 && f.deletions >= EMPTIED_DELETIONS_FLOOR,
  );
  const removed = files.filter((f) => f.status === "removed");
  const broken = [...emptied, ...removed];

  if (broken.length > 0) {
    const list = broken
      .map((f) => `${f.filename} (${f.status === "removed" ? "deleted" : `emptied, -${f.deletions} lines`})`)
      .join(", ");
    return {
      ok: false,
      reason:
        `The pull request at ${prUrl} destroys existing content: ${list}. Publishing a guide ` +
        `never empties or deletes a file, so this PR is not finished work - most likely a ` +
        `write truncated the file instead of updating it. The suggestion has been left as it ` +
        `was. Restore the affected file(s) from the base branch, redo the edit, verify with ` +
        `ls -l and head that the file has real content, push to the same branch, then call ` +
        `update_suggestion again. Do not open a second PR.`,
    };
  }

  return { ok: true, checked: true };
}
