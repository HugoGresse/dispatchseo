// A one-shot "your repo may not be fully cleaned up" notice, carried across
// the redirect that ends deleteProject/deleteAccount.
//
// Deleting a project ends in redirect(), which throws - so a teardown that
// only partly succeeded has no return value left to report through. Without
// this the failure mode is the exact one the teardown was written to kill:
// the owner is told nothing, and finds out from GitHub's failure emails days
// later. A cookie survives the redirect and the banner turns it into a
// sentence plus the command that finishes the job.
//
// Deliberately NOT httpOnly: it holds a repo slug and a list of things that
// didn't happen - nothing sensitive - and readable-from-JS means the banner
// dismisses itself by clearing the cookie, with no extra API route to own.

export const REPO_NOTICE_COOKIE = "ds_repo_cleanup";

// owner/repo, GitHub's own character set. Enforced on the way OUT as well as
// in: the banner builds a shell command around this value and invites the
// owner to paste it into a terminal, and this cookie is JS-writable by
// design - so the read side re-validates rather than trusting that whatever
// is in the jar came from us.
export const REPO_SLUG = /^[\w.-]+\/[\w.-]+$/;

export type RepoCleanupNotice = {
  repo: string;
  warnings: string[];
};

// Base64url so the JSON survives cookie encoding intact, and capped so a
// pathological warning list can't blow past the 4KB cookie limit and get the
// whole Set-Cookie dropped.
export function encodeRepoNotice(notice: RepoCleanupNotice): string {
  const trimmed: RepoCleanupNotice = {
    repo: notice.repo.slice(0, 120),
    warnings: notice.warnings.slice(0, 4).map((w) => w.slice(0, 240)),
  };
  return Buffer.from(JSON.stringify(trimmed), "utf8").toString("base64url");
}

export function decodeRepoNotice(raw: string | undefined): RepoCleanupNotice | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as RepoCleanupNotice).repo !== "string" ||
      !Array.isArray((parsed as RepoCleanupNotice).warnings)
    ) {
      return null;
    }
    const notice = parsed as RepoCleanupNotice;
    if (!REPO_SLUG.test(notice.repo)) return null;
    return {
      repo: notice.repo,
      warnings: notice.warnings.filter((w): w is string => typeof w === "string"),
    };
  } catch {
    // A malformed cookie is not worth a crash on the dashboard shell.
    return null;
  }
}
