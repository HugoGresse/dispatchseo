import { db } from "./db";
import { verifyPipelinePrereqs } from "./github";
import { effectiveAutomations, type Project } from "./projects";

// Backend self-heal for the install stamp. The cloud install is zero-touch:
// the App commits the pipeline and the background setup agent is supposed to
// finish by calling mark_pipeline_installed - but that final call sits at the
// end of a run the platform doesn't control, and when it never lands the
// project reads as mid-setup forever: the scheduler (correctly) skips it, so
// research and builds never start, while every backend measurement says the
// install is complete. The first real cloud user hit exactly this (2026-08-02:
// setup ran green twice, workflows live and reporting, stamp never set).
//
// So the backend reconciles from its own evidence instead of waiting on the
// agent's word: setup provably finished (site profile saved) AND
// verifyPipelinePrereqs positively passes -> stamp. Anything less is a no-op:
// unlike mark_pipeline_installed, which may stamp on the agent's checklist
// when GitHub is unverifiable, self-heal acts only on proof.

export type ReconcileResult =
  // Stamped now - the caller can treat the project as installed immediately.
  | { state: "stamped" }
  // Everything ran but a verifiable problem blocks the unlock (typically the
  // "Allow GitHub Actions to create and approve pull requests" toggle, which
  // the App cannot set itself). These strings are owner-facing.
  | { state: "blocked"; problems: string[] }
  // Not a candidate (already stamped, no repo, setup still running) or GitHub
  // was unverifiable - nothing to conclude either way.
  | { state: "not-ready" };

// The wizard finale polls its status endpoint every 6s and each verify is 4
// GitHub calls, so debounce per project. Module-level like the status route's
// prCache: per-lambda, best-effort, disappears with the instance.
const lastAttempt = new Map<string, { at: number; result: ReconcileResult }>();
const DEBOUNCE_MS = 60_000;

export async function reconcileInstallStamp(
  project: Project & { github_installation_id?: number | null },
): Promise<ReconcileResult> {
  if (project.pipeline_installed_at) return { state: "not-ready" };
  if (!project.github_repo) return { state: "not-ready" };

  const cached = lastAttempt.get(project.id);
  if (cached && Date.now() - cached.at < DEBOUNCE_MS) return cached.result;

  const settle = (result: ReconcileResult): ReconcileResult => {
    lastAttempt.set(project.id, { at: Date.now(), result });
    return result;
  };

  // Setup's proof-of-work, same evidence mark_pipeline_installed requires: a
  // saved site profile means the personalization run actually completed.
  // Tolerant like every pre-migration path - a query error never stamps.
  try {
    const { count, error } = await db()
      .from("site_profile")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    if (error || (count ?? 0) === 0) return settle({ state: "not-ready" });
  } catch {
    return settle({ state: "not-ready" });
  }

  const verdict = await verifyPipelinePrereqs(
    project.github_repo,
    effectiveAutomations(project).auto_merge,
    project,
  );
  if (!verdict.checked) return settle({ state: "not-ready" });
  if (verdict.problems.length > 0) return settle({ state: "blocked", problems: verdict.problems });

  // Same stamp mark_pipeline_installed writes, including the pre-0040
  // fallback (migrations are applied by hand, so code can reach a database
  // without pipeline_verified).
  const stampedAt = new Date().toISOString();
  let { error } = await db()
    .from("projects")
    .update({ pipeline_installed_at: stampedAt, pipeline_verified: true })
    .eq("id", project.id);
  if (error && /pipeline_verified|does not exist/i.test(error.message)) {
    ({ error } = await db()
      .from("projects")
      .update({ pipeline_installed_at: stampedAt })
      .eq("id", project.id));
  }
  if (error) return settle({ state: "not-ready" });
  return settle({ state: "stamped" });
}
