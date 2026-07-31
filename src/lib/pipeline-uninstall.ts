import { pipelinePackPaths } from "./pipeline-pack";
import { tokenForRef } from "./github";
import { isCloudMode } from "./cloud";

// The mirror of pipeline-install.ts: take back everything the install put
// into the customer's repo, so deleting a project actually ends the project.
//
// Why this exists: deleting the row only ever deleted OUR state. The repo kept
// its committed workflows, kept its cron schedules, and kept calling a backend
// that no longer knew the token - so every schedule turned into a failed run
// and a GitHub notification email, forever, with an error message pointing at
// DispatchSEO ("check the backend and SEO_MCP_API_KEY") rather than at the
// deletion the owner actually performed. The webhook that handles App
// uninstalls already said this out loud in a comment ("an uninstall does NOT
// stop their already-committed workflows"); this is that gap closed for the
// delete path.
//
// ORDER IS THE DESIGN. Disabling the workflows comes first and is the only
// step that truly has to land: a disabled workflow stops firing immediately,
// so even if the commit is rejected by branch protection and the secret
// delete 403s, the owner's inbox goes quiet. File removal is the tidy-up.
//
// WHAT THIS NEVER TOUCHES: content. The pack files, .dispatchseo/, and the
// seo-* slash commands are machinery we wrote. The guides and tools that
// shipped, the content list/detail templates the setup agent scaffolded into
// the repo's own stack, and the sitemap wiring are the customer's site - they
// stay, exactly as they'd stay if they'd never used us.

const GH = "https://api.github.com";

type UninstallProject = {
  github_repo: string | null;
  github_installation_id?: number | null;
};

export type UninstallResult = {
  // ok means "nothing we installed is still running". Warnings flip it false
  // so the caller is forced to say something rather than redirect quietly.
  ok: boolean;
  repo: string | null;
  workflows_disabled: number;
  files_removed: number;
  secret_removed: boolean;
  warnings: string[];
};

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "dispatchseo-app",
    "Content-Type": "application/json",
  };
}

async function gh(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${GH}${path}`, {
      method,
      headers: headers(token),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    let json: Record<string, unknown> | null = null;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch {
    // Network/timeout. Never throw out of here - a GitHub outage must not be
    // able to block someone from deleting their own project.
    return { status: 0, json: null };
  }
}

// Everything the install side is responsible for putting in the repo, matched
// against what's actually on the default branch. The pack manifest is the
// authoritative list (so this can never drift from install), widened by two
// globs for the paths the SETUP AGENT writes rather than the backend:
// .dispatchseo/publish-paths and .dispatchseo/conventions.md are deliberately
// outside the pack so pack updates don't clobber them, and a repo may carry
// extra seo-* slash commands from an older pack version.
function isOurs(path: string, packPaths: Set<string>): boolean {
  if (packPaths.has(path)) return true;
  if (path.startsWith(".dispatchseo/")) return true;
  // Only seo-prefixed commands: .claude/commands/ is shared ground, and the
  // repo's own slash commands live there too.
  if (/^\.claude\/commands\/seo-[^/]+\.md$/.test(path)) return true;
  return false;
}

export async function uninstallPipelineFromRepo(
  project: UninstallProject,
): Promise<UninstallResult> {
  const repo = project.github_repo;
  const result: UninstallResult = {
    ok: true,
    repo,
    workflows_disabled: 0,
    files_removed: 0,
    secret_removed: false,
    warnings: [],
  };
  // No repo was ever connected - there is nothing installed to take back.
  if (!repo) return result;

  // A cloud tenant's repo may ONLY be touched with that tenant's own App
  // installation token. tokenForRef falls back to the instance-wide PAT
  // whenever the installation id is missing, which is fine for the read and
  // merge paths it was written for but not for deleting files: the App
  // uninstall webhook nulls github_installation_id while deliberately keeping
  // github_repo, so "uninstall the App, then delete the project" is an
  // ordinary sequence that would otherwise reach a third party's repo holding
  // the operator's own credential. Refuse, and say why.
  if (isCloudMode() && !project.github_installation_id) {
    result.ok = false;
    result.warnings.push(
      "The DispatchSEO GitHub App is no longer installed on this repo, so its workflows could not be removed.",
    );
    return result;
  }

  const token = await tokenForRef(project);
  if (!token) {
    result.ok = false;
    result.warnings.push(
      "No GitHub credential was available, so nothing could be removed from the repo.",
    );
    return result;
  }

  // ---- 1. Disable the workflows (the step that actually stops the emails) --
  // Tracked separately from result.ok because step 3 is gated on it: the
  // secret must not be removed while anything might still run.
  let workflowsHandled = false;
  const list = await gh(token, "GET", `/repos/${repo}/actions/workflows?per_page=100`);
  if (list.status === 200) {
    const workflows = (list.json?.workflows ?? []) as Array<{
      id: number;
      path: string;
      state: string;
    }>;
    const ours = workflows.filter((w) => w.path.startsWith(".github/workflows/seo-"));
    // In parallel: a repo carries ~11 of these and a server action does not
    // have the budget to walk them one round trip at a time.
    const disables = await Promise.allSettled(
      ours.map(async (w) => {
        // Already disabled (self-host local-backend installs disable most of
        // the pack by hand) - nothing to do, still counts as handled.
        if (w.state.startsWith("disabled")) return true;
        const res = await gh(token, "PUT", `/repos/${repo}/actions/workflows/${w.id}/disable`);
        return res.status === 204;
      }),
    );
    result.workflows_disabled = disables.filter(
      (d) => d.status === "fulfilled" && d.value,
    ).length;
    workflowsHandled = result.workflows_disabled === ours.length;
    if (!workflowsHandled) {
      result.ok = false;
      result.warnings.push(
        `${ours.length - result.workflows_disabled} of ${ours.length} scheduled workflows could not be disabled and may keep running.`,
      );
    }
  } else if (list.status === 404) {
    // Repo gone, or the App was uninstalled from it. Nothing is running that
    // we could stop, and nothing left to clean - not a failure.
    return result;
  } else {
    result.ok = false;
    result.warnings.push(
      `Could not list the repo's workflows (HTTP ${list.status}), so they may still be scheduled.`,
    );
  }

  // ---- 2. Remove the files, in one commit ---------------------------------
  const repoInfo = await gh(token, "GET", `/repos/${repo}`);
  const branch = String(repoInfo.json?.default_branch ?? "main");
  const ref = await gh(token, "GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${branch}`)}`);
  const headSha = (ref.json?.object as { sha?: string } | undefined)?.sha;

  if (repoInfo.status !== 200 || ref.status !== 200 || !headSha) {
    result.ok = false;
    result.warnings.push("Could not read the repo's default branch, so the files were left in place.");
    return result;
  }

  const treeRes = await gh(token, "GET", `/repos/${repo}/git/trees/${headSha}?recursive=1`);
  const entries = (treeRes.json?.tree ?? []) as Array<{ path: string; type: string }>;
  const packPaths = new Set(pipelinePackPaths());
  const doomed = entries
    .filter((e) => e.type === "blob" && isOurs(e.path, packPaths))
    .map((e) => e.path);
  // Only fires on repos big enough for GitHub to truncate the tree listing
  // (~100k entries). Say so rather than silently under-deleting.
  if (treeRes.json?.truncated === true) {
    result.ok = false;
    result.warnings.push(
      "The repo is large enough that GitHub truncated its file listing, so some DispatchSEO files may remain.",
    );
  }

  if (doomed.length > 0) {
    const headCommit = await gh(token, "GET", `/repos/${repo}/git/commits/${headSha}`);
    const baseTree = (headCommit.json?.tree as { sha?: string } | undefined)?.sha;
    if (!baseTree) {
      result.ok = false;
      result.warnings.push("Could not read the repo's file tree, so the files were left in place.");
      return result;
    }
    // sha:null on an existing path is git-tree-speak for "delete this blob".
    const tree = await gh(token, "POST", `/repos/${repo}/git/trees`, {
      base_tree: baseTree,
      tree: doomed.map((path) => ({ path, mode: "100644", type: "blob", sha: null })),
    });
    const commit =
      tree.status === 201 && tree.json?.sha
        ? await gh(token, "POST", `/repos/${repo}/git/commits`, {
            message:
              "Remove the DispatchSEO content pipeline\n\nThe DispatchSEO project for this site was deleted, so its workflows and\nconfiguration were removed. Published content is untouched.",
            tree: tree.json.sha,
            parents: [headSha],
          })
        : null;
    const newSha = commit?.status === 201 ? String(commit.json?.sha ?? "") : "";
    const refUpdate = newSha
      ? await gh(token, "PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, {
          sha: newSha,
          force: false,
        })
      : null;

    if (refUpdate?.status === 200) {
      result.files_removed = doomed.length;
    } else {
      // Branch protection, a missing `workflows` permission on a self-host
      // PAT, or a race. NOT worth falling back to a PR the way install does:
      // install's PR gets merged because someone is mid-onboarding and
      // watching, whereas nobody merges a cleanup PR for a project they just
      // deleted - it would sit open forever. The workflows are already
      // disabled by this point, so the harm is cosmetic; tell them what to
      // delete and move on.
      result.ok = false;
      result.warnings.push(
        `${doomed.length} DispatchSEO files could not be removed (the branch may be protected). They are inert now that the workflows are disabled.`,
      );
    }
  }

  // ---- 3. Delete the tenant secret ----------------------------------------
  // Last, and GATED, for the same reason the disable step is first: this is
  // the credential the workflows authenticate with. Pulling it while any of
  // them might still fire would convert their next scheduled run into exactly
  // the failed-run-plus-email this module exists to prevent - so if step 1
  // couldn't confirm every workflow is off, the secret stays. It is inert
  // either way (the project row it authenticates is about to be deleted); the
  // point is to not leave a repo in a state we didn't verify.
  if (workflowsHandled) {
    const secret = await gh(token, "DELETE", `/repos/${repo}/actions/secrets/SEO_MCP_API_KEY`);
    if (secret.status === 204 || secret.status === 404) {
      result.secret_removed = true;
    } else {
      result.ok = false;
      result.warnings.push(
        `The SEO_MCP_API_KEY secret could not be removed (HTTP ${secret.status}). It no longer grants access to anything.`,
      );
    }
  } else {
    result.warnings.push(
      "The SEO_MCP_API_KEY secret was left in place, since removing it while a workflow might still run would only add failed runs.",
    );
  }

  return result;
}

// Disconnect WITHOUT deleting: take the pipeline back out of the repo and
// forget which repo it was, while the project, its keywords, rank history and
// published pages all stay exactly as they are.
//
// This exists because "stop using DispatchSEO for this site" had no path at
// all on self-host. Deleting is refused for the home project (it anchors the
// schema's column defaults), Settings renders the repo as read-only text, and
// set_github_repo is cloud-only and rejects an empty value - so a self-hoster
// whose one site was a trial had workflows running in their repo, spending
// their own Actions minutes, with no button anywhere that stopped it. The only
// way out was deleting the workflow files by hand through the GitHub API.
//
// ON FAILURE THE REPO STAYS CONNECTED, deliberately. Clearing github_repo
// while the workflows are still live in the repo would strand them: they would
// keep firing on their schedules against a project that no longer claims them,
// failing every run, emailing the owner, burning Actions minutes - and there
// would be nothing left to retry the disconnect FROM, because the repo we
// needed to reach is the field we just cleared. That is the exact trap this
// module's header describes; leaving the connection in place keeps the retry
// possible and the state honest.
export type DisconnectResult = {
  ok: boolean;
  repo: string | null;
  /** Null when there was nothing connected to begin with. */
  teardown: UninstallResult | null;
  warnings: string[];
};

export async function disconnectRepoFromProject(project: {
  id: string;
  github_repo: string | null;
  github_installation_id?: number | null;
}): Promise<DisconnectResult> {
  const repo = project.github_repo;
  if (!repo) {
    return { ok: true, repo: null, teardown: null, warnings: [] };
  }

  const teardown = await uninstallPipelineFromRepo(project);
  if (!teardown.ok) {
    return { ok: false, repo, teardown, warnings: teardown.warnings };
  }

  // pipeline_installed_at goes too: a project with no repo cannot have an
  // installed pipeline, and leaving the stamp behind would make a later
  // reconnect look already-finished to every readiness gate that reads it.
  const { db } = await import("./db");
  const { error } = await db()
    .from("projects")
    .update({ github_repo: null, pipeline_installed_at: null })
    .eq("id", project.id);
  if (error) {
    return {
      ok: false,
      repo,
      teardown,
      warnings: [
        `DispatchSEO was removed from ${repo}, but this project still lists it as connected (${error.message}). Try again - re-running is safe, since everything it removes is already gone.`,
      ],
    };
  }

  return { ok: true, repo, teardown, warnings: [] };
}
