"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bustInstanceCache } from "@/lib/dashboard-auth";
import { dashboardAuth } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { currentUser } from "@/lib/cloud-auth";
import { captureServer } from "@/lib/posthog-server";
import {
  assertInstallationClaimable,
  assertProjectOwned,
  assertRowOwned,
  assertRowsOwned,
} from "@/lib/tenant-guard";
import { remainingSites } from "@/lib/billing";
import { dispatchToolBuild, mergePr } from "@/lib/github";
import { getActiveProject, PROJECT_COOKIE } from "@/lib/active-project";
import {
  AUTO_PRESET,
  SEMI_PRESET,
  DEFAULT_PROJECT_ID,
  effectiveAutomations,
  getProjectById,
  getProjectBySlug,
  modeForFlags,
  type AutomationFlags,
} from "@/lib/projects";
import { markCronFixed } from "@/lib/cron-alerts";
import { setProjectAgent, verifyAgentCredential } from "@/lib/agent-settings";
import { agentById, projectAgent } from "@/lib/agents";
import { saveContentPrefs } from "@/lib/content-prefs-store";
import { encryptSecret } from "@/lib/crypto";
import { validateSerpapiKey } from "@/lib/serp";
import { placeAtFront, writeQueueOrder } from "@/lib/queue";
import { duplicateNote, findDuplicateSuggestion, isDuplicateKeyError } from "@/lib/suggestion-dedupe";
import { requestTrendExpand, requestTrendScan } from "@/lib/trends";
import { fetchDomainRegistrationDate } from "@/lib/domain-age";
import { bustGscCredCache, gscAccessProbe, type GscAccessProbe } from "@/lib/gsc";
import { uninstallPipelineFromRepo, type UninstallResult } from "@/lib/pipeline-uninstall";
import { REPO_NOTICE_COOKIE, encodeRepoNotice } from "@/lib/repo-notice";

// Every action re-validates auth server-side - the proxy only does presence
// routing, this is the real check. dashboardAuth covers both modes: the
// dash_auth cookie on self-host, the Supabase session in CLOUD_MODE.
async function assertAuthed() {
  if (!(await dashboardAuth())) {
    throw new Error("Unauthorized");
  }
}

export async function decideSuggestion(
  id: string,
  decision: "approved" | "rejected",
): Promise<{ dispatchNote?: string }> {
  await assertAuthed();
  await assertRowOwned("suggestions", id);
  // select("*") tolerates rows from before migrations 0013/0014 - the source
  // and queue_position keys just come back undefined.
  const { data, error } = await db()
    .from("suggestions")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  // Approving a TOOL idea starts its build immediately (repository_dispatch
  // to the suggestion's project repo). Guides need no dispatch - the daily
  // builder picks them up on schedule.
  let dispatchNote: string | undefined;
  if (decision === "approved" && data?.type === "tool") {
    const project = data.project_id ? await getProjectById(data.project_id) : null;
    const dispatch = await dispatchToolBuild(project, id);
    // dispatchToolBuild's result used to be discarded here, so the dashboard
    // always showed "✓ Approved" even when the instant build trigger silently
    // failed (no token, no repo, GitHub error) - the MCP tool's equivalent
    // (propose_suggestion/update_suggestion in route.ts) already surfaces this
    // as a note; give the dashboard the same honesty instead of staying quiet.
    if (!dispatch.dispatched) {
      dispatchNote =
        dispatch.reason === "no-repo"
          ? "no content pipeline is connected yet - nothing can build until the pipeline install step on Home is done"
          : dispatch.reason === "no-token"
            ? "no GitHub token connected - the Wednesday tool sweep will pick it up once that's fixed"
            : "the instant build trigger could not reach GitHub - the Wednesday tool sweep will pick it up";
    }
  }
  // Approving a trend find puts it at the front of the queue - that's the
  // whole point of the radar: it ships next morning, while the hype window
  // is open. Visible on the dashboard, so it can be dragged back down.
  if (decision === "approved" && data?.source === "trend-scan" && data.project_id) {
    await placeAtFront(data.project_id, id, data.type);
  }
  await captureServer(
    (await currentUser())?.id ?? data?.project_id ?? id,
    decision === "approved" ? "suggestion_approved" : "suggestion_rejected",
    { type: data?.type, source: data?.source },
  );
  revalidatePath("/dashboard");
  revalidatePath("/trends");
  revalidatePath("/research");
  return { dispatchNote };
}

// The Home banner's "Mark fixed" - the dashboard face of the mark_cron_fixed
// MCP tool. An owner judgment call: clears the alert now; if the job is still
// broken the next failed run or missed window re-raises it on its own.
//
// Scoped exactly like the banner that renders it (dashboard/page.tsx passes
// the same slug in cloud mode): `job` arrives from the client, and a server
// action is callable directly, so without the slug markCronFixed resolves it
// against getCronHealth(undefined) - the ALL-tenants view - and one tenant
// could silence a sibling's failure banner and its alert email. Self-host
// stays deployment-wide: there, one owner really does own every job.
export async function markCronFixedAction(job: string) {
  await assertAuthed();
  const project = isCloudMode() ? await getActiveProject() : null;
  await markCronFixed(job, project?.slug);
  revalidatePath("/dashboard");
}

// ---- the owner's queue (manual ideas + explicit build order) ----------------

export type AddIdeaState = { error: string } | { ok: true; message: string } | null;

// The dashboard's Add-idea form: the owner types a guide or tool idea and it
// lands in the build queue already approved - they wrote it, there is nothing
// to gate. A sparse idea (just a title) is fine: the build instructions tell
// the builder to do the keyword/SERP validation itself when the spec is thin.
export async function addManualSuggestion(
  _prev: AddIdeaState,
  formData: FormData,
): Promise<AddIdeaState> {
  await assertAuthed();

  const type = String(formData.get("type") ?? "guide");
  if (type !== "guide" && type !== "tool") return { error: "Pick guide or tool." };
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the idea a title." };
  const keyword = String(formData.get("keyword") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const placement = String(formData.get("placement") ?? "back");

  const project = await getActiveProject();
  // Same one-keyword-one-idea rule the MCP's propose_suggestion enforces
  // (suggestion-dedupe.ts): adding a keyword that is already queued would put
  // two builders on one target.
  const dupe = await findDuplicateSuggestion(project.id, type, keyword);
  if (dupe.active) return { error: duplicateNote(dupe.active) };
  const row = {
    project_id: project.id,
    type,
    title,
    primary_keyword: keyword || null,
    rationale: notes || null,
    status: "approved",
    decided_at: new Date().toISOString(),
  };
  // Same pre-0014 tolerance as the MCP's propose: retry without source so
  // manual adds keep working before the migration (losing only the label).
  let { data, error } = await db()
    .from("suggestions")
    .insert({ ...row, source: "manual" })
    .select()
    .single();
  if (error && !isDuplicateKeyError(error)) {
    ({ data, error } = await db().from("suggestions").insert(row).select().single());
  }
  // 0043's index catching a duplicate that landed between the check above and
  // this insert - say what happened, not "23505".
  if (isDuplicateKeyError(error)) {
    const raced = await findDuplicateSuggestion(project.id, type, keyword);
    return {
      error: raced.active ? duplicateNote(raced.active) : "That keyword is already in the queue.",
    };
  }
  if (error) return { error: error.message };

  if (placement === "front") {
    await placeAtFront(project.id, data.id, type);
  }

  revalidatePath("/dashboard");
  revalidatePath("/research");
  revalidatePath("/tools");
  const message =
    type === "tool"
      ? placement === "front"
        ? "Queued next for the tool builder - Build now on Research fires it immediately."
        : "Added to the tool queue."
      : placement === "front"
        ? "Queued next - it's tomorrow morning's build."
        : "Added to the end of the guide queue.";
  return { ok: true, message };
}

// Persist a drag-reorder of one build queue (guides and tools are separate
// lists). The dashboard has already reordered on screen - this writes dense
// queue_position 1..n behind the scenes so what you see is what builds.
// Returns { ok } instead of throwing: the client reverts the optimistic order
// on failure and shows the message inline.
export async function reorderQueue(
  group: "guide" | "tool",
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  await assertAuthed();
  if (group !== "guide" && group !== "tool") return { ok: false, message: "Bad group." };

  const project = await getActiveProject();
  const result = await writeQueueOrder(project.id, group, orderedIds);
  if (!result.ok) return result;
  revalidatePath("/dashboard");
  revalidatePath("/research");
  return result;
}

// Second thoughts on a rejection: put a History item back into its build
// queue as approved. It re-enters unpositioned (FIFO by its original date) -
// the queue is drag-sortable now, so where it builds is one drag away.
export async function restoreSuggestion(id: string) {
  await assertAuthed();
  // Scoped to the active project like the trend-topic actions - single-owner
  // app, so this is hygiene (a History id can only touch its own project's
  // rows), not a cross-tenant gate.
  const project = await getActiveProject();
  const { error } = await db()
    .from("suggestions")
    .update({ status: "approved", decided_at: new Date().toISOString(), queue_position: null })
    .eq("id", id)
    .eq("project_id", project.id)
    .eq("status", "rejected");
  if (error) {
    // Pre-0014 tolerance: retry without queue_position so restore still works.
    const { error: retryError } = await db()
      .from("suggestions")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("project_id", project.id)
      .eq("status", "rejected");
    if (retryError) throw new Error(retryError.message);
  }
  revalidatePath("/dashboard");
  revalidatePath("/research");
  revalidatePath("/trends");
}

// Fires the builder for a tool that is sitting approved in the queue (manual
// adds choose "queue it"; this is the later "actually, build it now").
export async function buildToolNow(id: string): Promise<{ ok: boolean; message: string }> {
  await assertAuthed();
  await assertRowOwned("suggestions", id);
  const { data, error } = await db().from("suggestions").select("*").eq("id", id).single();
  if (error) return { ok: false, message: error.message };
  if (data.type !== "tool" || data.status !== "approved") {
    return { ok: false, message: "Only queued tool ideas can be built." };
  }
  const project = data.project_id ? await getProjectById(data.project_id) : null;
  const dispatch = await dispatchToolBuild(project, id);
  revalidatePath("/dashboard");
  revalidatePath("/research");
  // dispatched was previously discarded here, so this button always said
  // "Build requested" even when the GitHub dispatch silently failed (no
  // token, no repo, GitHub error) - the owner saw success and nothing ever
  // arrived, with no error to explain why. Mirror the MCP tool's wording
  // (route.ts) so both faces tell the same honest story.
  if (dispatch.dispatched) {
    return { ok: true, message: "Build requested - the PR lands in a few minutes." };
  }
  return {
    ok: false,
    message:
      dispatch.reason === "no-repo"
        ? "No content pipeline is connected yet - nothing can build until the pipeline install step on Home is done."
        : dispatch.reason === "no-token"
          ? "No GitHub token connected - see the Connect GitHub step in setup. The idea stays approved; the Wednesday tool sweep will pick it up once that's fixed."
          : "The instant build trigger could not reach GitHub - the idea stays approved, and the Wednesday tool sweep will pick it up.",
  };
}

// ---- the trend radar (two-stage: subjects, then takes) ----------------------
// The cooldown + dispatch logic lives in lib/trends.ts, shared with the MCP's
// trigger_trend_scan / expand_trend_topic tools - one code path, two doors.

// The Trend radar's Scan now button: wakes the project repo's trend-scan
// workflow (stage 1 - trending subjects only). The scan runs in the repo's
// CI and reports back through the MCP - subjects appear on the radar a few
// minutes later.
export async function triggerTrendScan(): Promise<{ ok: boolean; message: string }> {
  await assertAuthed();
  const project = await getActiveProject();
  const result = await requestTrendScan(project);
  if (result.ok) revalidatePath("/trends");
  return result;
}

// Get takes on a radar subject: wakes the trend-expand workflow for that ONE
// topic. The card flips to "working on takes"; the run's suggestions land
// under it linked by trend_topic_id.
export async function expandTrendTopic(id: string): Promise<{ ok: boolean; message: string }> {
  await assertAuthed();
  const project = await getActiveProject();
  const result = await requestTrendExpand(project, id);
  if (result.ok) {
    revalidatePath("/trends");
    revalidatePath("/dashboard");
  }
  return result;
}

// Pass on a radar subject. Dismissed subjects stay dismissed - the scan's
// dedupe reads all statuses, so it won't re-propose them.
export async function dismissTrendTopic(id: string) {
  await assertAuthed();
  const project = await getActiveProject();
  const { error } = await db()
    .from("trend_topics")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("project_id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/trends");
  revalidatePath("/dashboard");
}

// There is deliberately NO build-now for trend takes (owner decision,
// 2026-07-15): guides ship at most one per day so the cadence stays steady
// instead of bursty. Approving a take already puts it at the front of the
// queue - the next daily build picks it up first, tomorrow at the latest.

export async function setProspectStatus(id: string, status: string) {
  await assertAuthed();
  await assertRowOwned("backlink_prospects", id);
  const allowed = ["new", "contacted", "acquired", "rejected"];
  if (!allowed.includes(status)) throw new Error("Bad status");
  const { error } = await db().from("backlink_prospects").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function mergeSeoPr(number: number) {
  await assertAuthed();
  const project = await getActiveProject();
  const result = await mergePr(project, number);
  // openSeoPrs caches the PR list for 60s per repo - mergePr already busts
  // the tag for future requests; updateTag additionally expires it for THIS
  // request (read-your-own-writes), so the merged PR's "Ready to ship" card
  // is gone on the very render this action streams back.
  if (project.github_repo) updateTag(`seo-prs:${project.github_repo}`);
  if (result.ok) {
    await captureServer((await currentUser())?.id ?? project.id, "pr_merged", { number });
  }
  revalidatePath("/dashboard");
  return result;
}

// Marks the manual "Request Google indexing" step done for a page - the row
// leaves the Get-it-on-Google card. Requires migration 0005
// (pages.index_requested_at); until it runs, the update fails and the card
// carries the migration nudge.
export async function markIndexRequested(id: string) {
  await assertAuthed();
  await assertRowOwned("pages", id);
  const { error } = await db()
    .from("pages")
    .update({ index_requested_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

// The batch variant: one browser session requests indexing for every pending
// page, so one button clears the whole card.
export async function markIndexRequestedBulk(ids: string[]) {
  await assertAuthed();
  if (ids.length === 0) return;
  await assertRowsOwned("pages", ids);
  const { error } = await db()
    .from("pages")
    .update({ index_requested_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function setPlaybookStatus(slug: string, status: "todo" | "done" | "skipped") {
  await assertAuthed();
  const project = await getActiveProject();
  const { error } = await db()
    .from("playbook_status")
    .upsert({
      project_id: project.id,
      slug,
      status,
      done_at: status === "done" ? new Date().toISOString() : null,
    });
  if (error) throw new Error(error.message);
  revalidatePath("/backlinks");
}

export type ConnectDataforseoState = { error: string } | { ok: true } | null;

// The "Connect DataForSEO" setup card (free-tier DIY: every project brings its
// own account). Credentials are verified with a live user_data call BEFORE
// saving, so a typo'd API password can never sit silently in the DB while the
// nightly cron fails.
export async function connectDataforseo(
  _prev: ConnectDataforseoState,
  formData: FormData,
): Promise<ConnectDataforseoState> {
  await assertAuthed();

  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  if (!login || !password) return { error: "Both fields are needed." };

  // Live check against the free user_data endpoint.
  try {
    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      headers: {
        Authorization: "Basic " + Buffer.from(`${login}:${password}`).toString("base64"),
      },
      cache: "no-store",
    });
    if (res.status === 401) {
      return {
        error:
          "DataForSEO rejected these credentials. Login is your account email; the password is the API password from app.dataforseo.com/api-access, not your dashboard password.",
      };
    }
    if (!res.ok) return { error: `DataForSEO answered HTTP ${res.status} - try again.` };
  } catch {
    return { error: "Could not reach DataForSEO - try again." };
  }

  // Encrypt the API password at rest (the login is a plain email, kept as-is
  // so the settings page can show which account is connected). A missing key is
  // a server misconfig, not a user error, but surface it so the owner can fix.
  let storedPassword: string;
  try {
    storedPassword = await encryptSecret(password);
  } catch {
    return {
      error: "Could not securely save the credentials - the server is missing its encryption key.",
    };
  }

  const project = await getActiveProject();
  // Connecting DataForSEO also makes it the keyword source - it's the most
  // accurate option, and this is the only gesture that means "use it".
  const { error } = await db()
    .from("projects")
    .update({
      dataforseo_login: login,
      dataforseo_password: storedPassword,
      keyword_source: "dataforseo",
    })
    .eq("id", project.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---- keyword data source (the onboarding wizard's step 3) ------------------

export type ConnectSerpapiState = { error: string } | { ok: true } | null;

// Free mode with a BYO SerpApi key: the key is checked live against the
// account endpoint (burns no search credits) before being saved encrypted,
// and the project flips to keyword_source 'serpapi'.
export async function connectSerpapi(
  _prev: ConnectSerpapiState,
  formData: FormData,
): Promise<ConnectSerpapiState> {
  await assertAuthed();

  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { error: "Paste your SerpApi key." };

  const check = await validateSerpapiKey(key);
  if (!check.ok) return { error: check.error };

  let storedKey: string;
  try {
    storedKey = await encryptSecret(key);
  } catch {
    return {
      error: "Could not securely save the key - the server is missing its encryption key.",
    };
  }

  const project = await getActiveProject();
  const { error } = await db()
    .from("projects")
    .update({ serpapi_key: storedKey, keyword_source: "serpapi" })
    .eq("id", project.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

// Settings: switch back to DataForSEO as the keyword source. Only valid when
// credentials are already saved - otherwise the connect form is the way in.
export async function chooseDataforseoSource() {
  await assertAuthed();
  const project = await getActiveProject();
  // Cloud bundles DataForSEO (the platform account) - a paying tenant switches
  // back to the plan they already have, no creds to paste. Only self-host needs
  // its own account here. (If bundled is over budget it degrades gracefully at
  // runtime; that's never a reason to block the switch itself.)
  const hasOwn = Boolean(project.dataforseo_login && project.dataforseo_password);
  if (!isCloudMode() && !hasOwn) {
    throw new Error("Connect DataForSEO credentials first.");
  }
  const { error } = await db()
    .from("projects")
    .update({ keyword_source: "dataforseo" })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Pure free mode: Search Console positions + autocomplete research, no SERP
// provider. Also the wizard's "Not interested, let's continue" path.
// Wizard step 2's "Connect service account" form: the owner pastes the JSON
// key file downloaded from Google Cloud, we validate its shape, encrypt it
// with the instance key, and store it - Search Console connects entirely
// from the browser, no .env edit, no restart. Env GSC_SERVICE_ACCOUNT_JSON
// still wins when set (gsc.ts resolution order).
export type ConnectGscState = { ok: true; email: string } | { error: string } | null;

export async function connectGscServiceAccount(
  _prev: ConnectGscState,
  formData: FormData,
): Promise<ConnectGscState> {
  await assertAuthed();
  // instance_settings is deployment-wide - one tenant must not overwrite the
  // shared credential. Cloud uses the per-project Google OAuth connect.
  if (isCloudMode()) {
    return { error: "On the hosted version, connect Search Console with the one-click Google button instead." };
  }
  const raw = String(formData.get("json") ?? "").trim();
  if (!raw) return { error: "Paste the contents of the downloaded JSON key file." };
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That doesn't parse as JSON - paste the whole file, exactly as downloaded." };
  }
  if (!parsed.client_email || !parsed.private_key) {
    return {
      error:
        "That JSON has no client_email/private_key - make sure it's the service account KEY file (Keys → Add key → Create new key → JSON).",
    };
  }
  const enc = await encryptSecret(raw);
  const { data, error } = await db()
    .from("instance_settings")
    .update({ gsc_service_account_json: enc })
    .eq("id", true)
    .select("id");
  if (error) {
    return {
      error: /gsc_service_account_json|column/i.test(error.message)
        ? "The database is missing migration 0029 - re-run setup.sql once, then try again."
        : error.message,
    };
  }
  if (!data || data.length === 0) {
    // Classic env-based install: no instance_settings row to store into.
    return {
      error:
        "This install is configured through environment variables - set GSC_SERVICE_ACCOUNT_JSON in your deployment env instead.",
    };
  }
  bustInstanceCache();
  bustGscCredCache();
  revalidatePath("/", "layout");
  return { ok: true, email: parsed.client_email };
}

// Wizard step 2's "Verify connection" button: probe Search Console access
// for the active project's (guessed) property right now, so the owner knows
// on the spot whether adding the service-account email worked instead of
// finding out from a paused automation next week.
export async function wizardCheckGscAccess(): Promise<GscAccessProbe> {
  await assertAuthed();
  const project = await getActiveProject();
  if (!project.gsc_site_url) {
    return { state: "error", why: "no Search Console property is set on this project yet" };
  }
  const first = await gscAccessProbe(project.gsc_site_url);
  if (first.state !== "pending" || !project.domain) return first;
  // The stored property is onboarding's GUESS (sc-domain:<domain>). If the
  // owner's site is actually verified as a URL-prefix property, that guess
  // can never pass - so on "no access", probe the other property shapes and
  // self-correct the project to whichever one the service account can read.
  const alternates = [
    `sc-domain:${project.domain}`,
    `https://${project.domain}/`,
    `https://www.${project.domain}/`,
    `http://${project.domain}/`,
  ].filter((s) => s !== project.gsc_site_url);
  for (const site of alternates) {
    const probe = await gscAccessProbe(site);
    if (probe.state === "ok") {
      await db().from("projects").update({ gsc_site_url: site }).eq("id", project.id);
      revalidatePath("/", "layout");
      return { state: "ok" };
    }
  }
  return first;
}

export async function chooseGscOnly() {
  await assertAuthed();
  const project = await getActiveProject();
  const { error } = await db()
    .from("projects")
    .update({ keyword_source: "gsc" })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// The wizard's power-ups step: remember which optional setup cards the user
// unchecked so Home stops offering them (re-enable by clearing in Settings).
const POWERUPS = ["merge", "pipeline", "playbook"] as const;

// Wizard one-tap-merge step: verify the pasted GitHub token against the
// project's OWN repo (which simultaneously proves the token works, has repo
// scope, and the repo name is real - including private repos the public API
// can't see), then store it encrypted like the GSC key. Env GH_MERGE_TOKEN
// still wins at read time (github.ts).
export type ConnectGithubState = { ok: true } | { error: string } | null;

export async function connectGithubToken(
  _prev: ConnectGithubState,
  formData: FormData,
): Promise<ConnectGithubState> {
  await assertAuthed();
  // Same instance-wide concern as the GSC key: the merge token is stored in
  // instance_settings. Cloud merges will go through the GitHub App instead.
  if (isCloudMode()) {
    return { error: "Not available on the hosted version - PR merging is handled per account." };
  }
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Paste the token GitHub generated." };
  const project = await getActiveProject();
  if (!project.github_repo) return { error: "Connect a repo in step 1 first." };
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${project.github_repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "dispatchseo-onboarding",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { error: "Could not reach GitHub - try again." };
  }
  if (res.status === 401) return { error: "GitHub rejected that token - copy it again, in full." };
  if (res.status === 404) {
    return {
      error: `This token can't see ${project.github_repo}. If it's a fine-grained token, make sure that repo is selected; classic tokens need the "repo" scope. (Also double-check the repo name in step 1.)`,
    };
  }
  if (!res.ok) return { error: `GitHub answered HTTP ${res.status} - try again.` };
  const repoInfo = (await res.json()) as { permissions?: { push?: boolean } };
  if (repoInfo.permissions && !repoInfo.permissions.push) {
    return { error: "The token can read the repo but not write to it - it needs push access to merge PRs." };
  }
  // The permissions field above reflects the OWNER's repo access, not what
  // this token was granted - a fine-grained token without Contents access
  // passes it and then the builder can't even clone (2026-07-23 e2e: install
  // sailed through, every background build died on clone). Probe the
  // capability the builder actually uses: reading the repo's commits.
  try {
    const probe = await fetch(
      `https://api.github.com/repos/${project.github_repo}/commits?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "dispatchseo-onboarding",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    // 409 = empty repo (no commits yet) - contents access proven anyway.
    if (!probe.ok && probe.status !== 409) {
      return {
        error: `The token can see ${project.github_repo} but can't read its code, so builds can't clone it. Fine-grained token? Give it "Contents" repository permission (Read and write) and paste it again.`,
      };
    }
  } catch {
    return { error: "Could not reach GitHub - try again." };
  }
  const enc = await encryptSecret(token);
  const { data, error } = await db()
    .from("instance_settings")
    .update({ gh_merge_token: enc })
    .eq("id", true)
    .select("id");
  if (error) {
    return {
      error: /gh_merge_token|column/i.test(error.message)
        ? "The database is missing migration 0030 - re-run setup.sql once, then try again."
        : error.message,
    };
  }
  if (!data || data.length === 0) {
    return {
      error: "This install is configured through environment variables - set GH_MERGE_TOKEN in your deployment env instead.",
    };
  }
  bustInstanceCache();
  revalidatePath("/", "layout");
  return { ok: true };
}

// Wizard resume: remember which screen the wizard stands on, so a closed
// tab or stuck terminal never loses progress. Tolerant of the 0030 column
// not existing yet - resume is a nicety, never a blocker.
export async function setWizardScreen(screenId: string) {
  await assertAuthed();
  if (!/^[a-z0-9_]{1,20}$/.test(screenId)) return;
  const project = await getActiveProject();
  await db().from("projects").update({ onboarding_screen: screenId }).eq("id", project.id);
}

// Skip a single wizard step (merge token / backlink playbook) - appends to
// powerups_skipped so the matching Home card stays hidden: a conscious skip
// in the wizard is a decision, not a leftover.
export async function skipPowerup(key: string) {
  await assertAuthed();
  if (!(POWERUPS as readonly string[]).includes(key)) return;
  const project = await getActiveProject();
  const next = Array.from(new Set([...project.powerups_skipped, key]));
  const { error } = await db()
    .from("projects")
    .update({ powerups_skipped: next })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function setPowerupsSkipped(skipped: string[]) {
  await assertAuthed();
  const clean = skipped.filter((s): s is (typeof POWERUPS)[number] =>
    (POWERUPS as readonly string[]).includes(s),
  );
  const project = await getActiveProject();
  const { error } = await db()
    .from("projects")
    .update({ powerups_skipped: clean })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// ---- multi-project ---------------------------------------------------------

// The header switcher: remember the chosen project and re-render everything.
export async function switchProject(slug: string) {
  await assertAuthed();
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("Unknown project");
  await assertProjectOwned(project.id);
  const jar = await cookies();
  jar.set(PROJECT_COOKIE, project.slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export type DeleteProjectState = { error: string } | null;

// Hand a partly-failed teardown to the next page load. Deleting ends in
// redirect(), so there is no return value left to report through - and a
// teardown nobody is told about is indistinguishable from no teardown at all.
async function stashRepoNotice(teardown: UninstallResult | null) {
  if (!teardown || teardown.ok || !teardown.repo || teardown.warnings.length === 0) return;
  (await cookies()).set(REPO_NOTICE_COOKIE, encodeRepoNotice({
    repo: teardown.repo,
    warnings: teardown.warnings,
  }), {
    path: "/",
    // Readable from JS on purpose - the banner dismisses itself by clearing it.
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
}

// The Settings danger zone. Deleting cascades through every table (migration
// 0006), so keywords, rank history, suggestions, pages, GSC snapshots,
// playbook progress, and the profile all go with the project row. The default
// project can't be deleted: it anchors the schema's column defaults and the
// legacy MCP_API_KEY mapping.
//
// Deleting also takes the pipeline back OUT of the connected repo - the
// workflows get disabled, the pack files and .dispatchseo/ get removed, and
// the SEO_MCP_API_KEY secret is deleted. Without that, "delete" only ever
// deleted our half: the repo kept firing its crons at a backend that no
// longer knew the token, so the owner got a GitHub failure email every hour,
// forever, blaming DispatchSEO for a deletion they asked for. Content is
// never touched - published guides, tools, and the templates the setup agent
// scaffolded are the customer's site, not our machinery.
//
// The repo teardown runs BEFORE the row delete (it needs github_repo and the
// installation id) and can never block it: a GitHub outage, a revoked App, or
// a protected branch must not be able to trap someone in a project they asked
// to delete. Anything left behind rides out on the cookie above instead.
//
// keep_repo is the migration escape hatch: moving a site to another
// DispatchSEO install (cloud -> self-host, most often) means deleting the
// project here while the repo's pipeline must keep working.
export async function deleteProject(
  _prev: DeleteProjectState,
  formData: FormData,
): Promise<DeleteProjectState> {
  await assertAuthed();

  const slug = String(formData.get("slug") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();

  const project = await getProjectBySlug(slug);
  if (!project) return { error: "Unknown project." };
  // Cloud: deleting is for the project's OWNER alone - the scariest of the
  // id-swapping (IDOR) targets, since 0006 cascades the delete everywhere.
  try {
    await assertProjectOwned(project.id);
  } catch {
    return { error: "Unknown project." };
  }
  if (project.id === DEFAULT_PROJECT_ID) {
    return { error: "The home project can't be deleted." };
  }
  if (confirm !== project.domain) {
    return { error: `Type ${project.domain} exactly to confirm.` };
  }

  const teardown =
    formData.get("keep_repo") === "on" ? null : await uninstallPipelineFromRepo(project);

  const { error } = await db().from("projects").delete().eq("id", project.id);
  // The repo teardown already happened by now, so a failure here leaves a
  // live project whose pipeline has been pulled out from under it. Say that
  // outright - "delete failed" on its own would send the owner back to a
  // dashboard that looks fine and a repo that has quietly stopped working.
  if (error) {
    return {
      error:
        teardown && teardown.repo
          ? `${project.name} could not be deleted (${error.message}), but DispatchSEO was already removed from ${teardown.repo}. Re-run the delete, or reconnect the repo from Settings to put the pipeline back.`
          : error.message,
    };
  }
  await stashRepoNotice(teardown);
  await captureServer((await currentUser())?.id ?? project.id, "project_deleted", {
    domain: project.domain,
  });

  // Drop the cookie instead of pinning a slug: the default project's slug
  // is user-defined since the wizard claims that row, and getActiveProject
  // falls back to the fixed-id project on a missing cookie anyway.
  const jar = await cookies();
  jar.delete(PROJECT_COOKIE);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export type DeleteAccountState = { error: string } | null;

// Closing the account for real: cancel the money, remove the data, remove the
// login - in that order, and the order IS the design.
//
// Billing first, and we ABORT if it fails. Polar is the source of truth for
// the subscription, so deleting the user first would leave someone paying for
// an account they can no longer sign into, with the cancel button sitting
// behind a login that no longer exists. A failed deletion is recoverable; a
// silent recurring charge is not.
//
// Projects are deleted explicitly rather than left to the foreign key.
// projects.owner_user_id is ON DELETE SET NULL, so removing the user would
// merely orphan them - and the crons enumerate every project with no owner
// filter (listProjectsChecked), so orphans keep pulling SERP and Search
// Console quota forever while being invisible to every dashboard.
//
// No MCP counterpart, deliberately, despite the parity rule in CLAUDE.md: the
// MCP token IS the tenant, so a project-scoped token able to delete the whole
// account would be a privilege escalation rather than parity.
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  if (!isCloudMode()) return { error: "Accounts only exist on the hosted version." };
  const auth = await dashboardAuth();
  const user = auth?.user;
  if (!user) return { error: "Not signed in." };

  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase()) {
    return { error: `Type ${user.email ?? "your email address"} exactly to confirm.` };
  }

  const { getSubscriptionOrThrow, polar, polarConfigured } = await import("@/lib/billing");
  let sub: Awaited<ReturnType<typeof getSubscriptionOrThrow>>;
  try {
    sub = await getSubscriptionOrThrow(user.id);
  } catch {
    // Abort rather than read "couldn't check" as "nothing to cancel" - the
    // latter deletes the account and leaves the subscription charging. Same
    // posture as the owned-projects read further down. Nothing is destroyed
    // yet, so retrying is free.
    return {
      error:
        "Couldn't check your billing status, so nothing was deleted. Try again in a moment - if it keeps failing, cancel your plan in the billing portal first.",
    };
  }
  // isActive() is the ACCESS test (active | trialing) - it is NOT the billing
  // test, and using it here was wrong. A past_due, unpaid or incomplete
  // subscription still exists at Polar: it can still recover, and it can still
  // charge. Gating cancellation on isActive() therefore deleted the account and
  // left the subscription running, with the dashboard that could have cancelled
  // it now gone - the user's only remaining route is Polar support. Cancel
  // anything that is not already in a terminal state (2026-07-27).
  // DENYLIST, not an allowlist. An allowlist silently skips any status it was
  // not told about - Polar's `paused` was already missing, and a provider can
  // add one at any time. Listing only the states where cancelling is genuinely
  // pointless means an unknown status errs toward "try to cancel it", which is
  // the safe direction: a redundant revoke is a no-op we already tolerate,
  // while a missed one keeps charging a card whose owner deleted their account.
  const TERMINAL_STATUSES = new Set(["canceled", "cancelled", "revoked", "incomplete_expired"]);
  if (sub?.provider_subscription_id && !TERMINAL_STATUSES.has(String(sub.status))) {
    if (!polarConfigured()) {
      return {
        error:
          "Can't reach billing to cancel your plan, so nothing was deleted. Cancel it in the billing portal first, then come back.",
      };
    }
    try {
      await polar().subscriptions.revoke({ id: sub.provider_subscription_id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Already cancelled is the state we wanted anyway - keep going.
      if (!/already.?cancell?ed/i.test(msg)) {
        return {
          error: `Couldn't cancel your subscription, so nothing was deleted. Cancel it in the billing portal, then try again. (${msg.slice(0, 120)})`,
        };
      }
    }
  }

  // Take the pipeline back out of every connected repo before the rows go -
  // afterwards there is no github_repo left to read. Best-effort and never
  // blocking: billing is already cancelled by this point, so a GitHub problem
  // must not be allowed to strand someone mid-deletion. Repos we couldn't
  // finish are named on the way out instead.
  const { data: owned, error: ownedError } = await db()
    .from("projects")
    .select("github_repo, github_installation_id")
    .eq("owner_user_id", user.id);
  // Abort rather than treat "couldn't read them" as "there are none": that
  // would delete the account while quietly leaving every repo running, which
  // is precisely the failure this teardown exists to end. Nothing has been
  // destroyed at this point - the plan is cancelled, which is recoverable by
  // re-subscribing, and the retry is safe.
  if (ownedError) {
    return {
      error: `Your plan was cancelled, but your sites could not be read, so nothing was deleted: ${ownedError.message}`,
    };
  }
  const teardowns = await Promise.allSettled(
    (owned ?? [])
      .filter((p) => p.github_repo)
      .map((p) =>
        uninstallPipelineFromRepo({
          github_repo: p.github_repo,
          // Must be carried through: in cloud this is what picks the App
          // installation token, and dropping it would silently downgrade
          // every teardown to the (unset) instance PAT path.
          github_installation_id: p.github_installation_id,
        }),
      ),
  );
  // Capped: this rides out in a redirect URL, and a long list would push it
  // past what proxies will carry - losing the whole notice rather than part
  // of it. /login renders the overflow as "and N more".
  const leftover = teardowns
    .filter((t) => t.status === "fulfilled" && !t.value.ok && t.value.repo)
    .map((t) => (t as PromiseFulfilledResult<UninstallResult>).value.repo as string)
    .slice(0, 20);

  const { error: projectsError } = await db()
    .from("projects")
    .delete()
    .eq("owner_user_id", user.id);
  if (projectsError) {
    return {
      error: `Your plan was cancelled, but the sites could not be deleted: ${projectsError.message}`,
    };
  }

  const { error: userError } = await db().auth.admin.deleteUser(user.id);
  if (userError) {
    return {
      error: `Your plan and sites are gone, but the login itself could not be removed: ${userError.message}`,
    };
  }
  await captureServer(user.id, "account_deleted");

  // Straight to /logout rather than clearing cookies here: it already tolerates
  // signing out a user that no longer exists, and it owns the cookie names.
  // Any repo we couldn't finish cleaning rides along to the login screen: the
  // dashboard banner is useless here (there's no account left to sign into),
  // and someone whose repo is still running our workflows has to be told
  // while they're still looking at the screen.
  (await cookies()).delete(PROJECT_COOKIE);
  redirect(leftover.length > 0 ? `/logout?leftover=${encodeURIComponent(leftover.join(","))}` : "/logout");
}

// Shared core of project creation: validates the form, inserts the row with a
// fresh MCP token, and switches the dashboard cookie to it. Only the wizard
// consumes it today (/new redirects there), but the split keeps creation
// reusable if a non-wizard entry point ever returns.
async function createProjectCore(
  formData: FormData,
): Promise<{ error: string } | { slug: string; name: string; domain: string; mcpToken: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const rawDomain = String(formData.get("domain") ?? "").trim();
  const mode = String(formData.get("mode") ?? "semi");

  // Accept the repo in any shape people actually paste: bare owner/repo, the
  // full GitHub URL (with or without .git, deep links like /tree/main), or
  // the SSH form - all normalize down to owner/repo.
  let repo = String(formData.get("repo") ?? "").trim();
  if (repo) {
    repo = repo
      .replace(/^git@github\.com:/i, "")
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/^github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/^\/+|\/+$/g, "");
    const parts = repo.split("/").filter(Boolean);
    if (parts.length >= 2) repo = `${parts[0]}/${parts[1]}`;
  }

  const domain = rawDomain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  if (!name) return { error: "Give the project a name." };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    return { error: "That domain does not look right - use something like example.com." };
  }
  // Cloud connects the repo via the GitHub App AFTER creation (wizard c1), so
  // an empty repo is the normal cloud case, not an error.
  if (!repo) {
    if (!isCloudMode()) {
      return { error: "Add your GitHub repo - Claude publishes content there as pull requests." };
    }
  } else if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return {
      error:
        "Could not read that repo - paste the GitHub URL (https://github.com/owner/repo) or just owner/repo.",
    };
  }
  if (mode !== "semi" && mode !== "auto") return { error: "Pick a mode." };

  if (!(await domainAnswers(domain))) {
    return {
      error: `We could not reach ${domain}. Check the spelling - it should be your live website's address.`,
    };
  }

  // The "does the site have a blog?" answer - a hint the setup workflow
  // reconciles against the actual repo (0017). The path hint only means
  // something alongside "existing".
  const contentMode = String(formData.get("content_mode") ?? "detect");
  if (!["existing", "create", "detect"].includes(contentMode)) {
    return { error: "Pick a content option." };
  }
  const contentPathHint = String(formData.get("content_path_hint") ?? "")
    .trim()
    .slice(0, 120);

  // Slug: the first domain label, falling back to the full dashed domain if
  // another project already claimed it (sub.example.com vs example.com).
  const firstLabel = domain.split(".")[0];
  const taken = await getProjectBySlug(firstLabel);
  const slug = taken ? domain.replace(/\./g, "-") : firstLabel;

  // Seed the site's age from the domain's public registration date (RDAP) -
  // a signup's domain almost never went live the day it joined DispatchSEO,
  // and the publishing pace would wrongly throttle an established site as
  // brand new. Null (lookup failed) leaves the column default (today);
  // Settings has the correction field either way.
  const siteLaunchedAt = await fetchDomainRegistrationDate(domain);

  const mcpToken = randomBytes(24).toString("hex");
  const row: Record<string, unknown> = {
    slug,
    name,
    domain,
    // Domain properties are the common case; if the site is verified as a
    // URL-prefix property instead, the value can be corrected later.
    gsc_site_url: `sc-domain:${domain}`,
    github_repo: repo || null,
    mcp_token: mcpToken,
    mode,
    content_mode: contentMode,
    // Stamp the screen that FOLLOWS creation, server-side, at the same instant
    // the row appears. Two things depended on this and both were broken while
    // the stamp was only written client-side by the wizard's fire-and-forget
    // setWizardScreen (2026-07-27):
    //
    //  1. hasConfiguredProject() (onboarding-gate.ts) treats
    //     `github_repo && onboarding_screen == null` as a grandfathered
    //     pre-0030 project and UNLOCKS the dashboard. A brand-new row matched
    //     that rule for the whole window between creation and the first
    //     setScreen POST landing - i.e. the dashboard unlocked at step 1.
    //  2. buildResume() defaults a null screen to "s5", the FINALE. If that
    //     POST was ever lost (tab closed on the step, navigation cancelling
    //     the in-flight request, a blip), reopening /onboarding skipped
    //     Search Console, the keyword source, publish mode and GitHub, and
    //     dropped the owner straight on "You're live."
    //
    // addSiteAndStartSetup already stamped it for the same reason; doing it
    // here covers the wizard's own creation path too, so no creation route can
    // produce a screenless row.
    onboarding_screen: isCloudMode() ? "c1" : "s1",
  };
  if (contentPathHint && contentMode === "existing") row.content_path_hint = contentPathHint;
  if (siteLaunchedAt) row.site_launched_at = siteLaunchedAt;
  // Cloud accounts own their projects (0031); the whole dashboard scopes by
  // this column in CLOUD_MODE, so a row without it would be orphaned.
  if (isCloudMode()) {
    const auth = await dashboardAuth();
    if (!auth?.user) return { error: "Sign in again to create a project." };
    const remaining = await remainingSites(auth.user.id);
    if (remaining !== null && remaining <= 0) {
      return {
        error:
          "Your plan doesn't have room for another site - pick or upgrade a plan on the Billing page.",
      };
    }
    row.owner_user_id = auth.user.id;
    // Bundled DataForSEO is the paid-tier default - the cloud wizard has no
    // keyword-source step (budget caps degrade to GSC-only under the hood).
    row.keyword_source = "dataforseo";
  }
  // A fresh instance's fixed-id default project (setup.sql seeds it NEUTRAL,
  // no domain/repo) is claimed in place by the first real site: same row,
  // same id - the project_id column defaults keep pointing at a real project
  // and no ghost "Your site" lingers in the switcher.
  const { data: defRow } = await db()
    .from("projects")
    .select("id, domain, github_repo")
    .eq("id", DEFAULT_PROJECT_ID)
    .maybeSingle();
  // Claiming the fixed-id seed row in place is a SELF-HOST first-boot mechanic.
  // On cloud it must never happen: the seed row is shared, so if it were ever
  // transiently neutral (re-seed, migration replay) two racing signups could
  // both "claim" it and annex the default project id + its legacy MCP_API_KEY /
  // DataForSEO fallbacks. Cloud signups always INSERT a fresh row.
  const claimDefault = !isCloudMode() && Boolean(defRow && !defRow.github_repo && !defRow.domain);
  const write = (r: Record<string, unknown>) =>
    claimDefault
      ? db().from("projects").update(r).eq("id", DEFAULT_PROJECT_ID)
      : db().from("projects").insert(r);

  let { error } = await write(row);
  if (error) {
    // Same pre-migration tolerance as manual suggestions: drop the columns
    // the error names (0015 and/or 0017 not applied yet) and retry once so
    // project creation keeps working in that window.
    const retry = { ...row };
    let dropped = false;
    if (error.message.includes("content_")) {
      delete retry.content_mode;
      delete retry.content_path_hint;
      dropped = true;
    }
    if (error.message.includes("site_launched_at")) {
      delete retry.site_launched_at;
      dropped = true;
    }
    // 0030 pending: the resume stamp is a nicety, never worth failing the
    // creation the owner is standing in front of. Dropping it puts the row
    // back on the pre-0030 grandfathering path, which is correct for a
    // database that genuinely predates screen persistence.
    if (error.message.includes("onboarding_screen")) {
      delete retry.onboarding_screen;
      dropped = true;
    }
    // 0031 pending on a self-host DB - harmless to drop there (ownership is a
    // cloud concept); CLOUD_MODE deployments must have 0031 applied.
    if (error.message.includes("owner_user_id") && !isCloudMode()) {
      delete retry.owner_user_id;
      dropped = true;
    }
    if (dropped) ({ error } = await write(retry));
  }
  if (error) {
    if (error.code === "23505") return { error: "A project for that domain already exists." };
    if (error.code === "42P01") {
      return { error: "The projects migration has not been applied yet - run 0004_projects.sql first." };
    }
    return { error: error.message };
  }

  const jar = await cookies();
  jar.set(PROJECT_COOKIE, slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  await captureServer((await currentUser())?.id ?? slug, "project_created", { domain });
  return { slug, name, domain, mcpToken };
}

export type WizardCreateState =
  | { error: string }
  | { ok: true; slug: string; name: string; domain: string; mcpToken: string }
  | null;

// On-the-spot liveness check for wizard step 1: a typo'd domain surfaces
// weeks later as a mystery cron failure, so the wizard refuses one it can
// prove wrong right now. The repo deliberately gets NO such check - private
// repos are the common case and answer 404 publicly, indistinguishable from
// a typo, and blocking the majority to catch the rarity read as a bug.
async function domainAnswers(domain: string): Promise<boolean> {
  for (const proto of ["https", "http"] as const) {
    try {
      await fetch(`${proto}://${domain}`, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(6000),
      });
      return true; // any HTTP answer counts - even an error page proves DNS + a server
    } catch {
      // try the next protocol
    }
  }
  return false;
}

// The onboarding wizard's step 1. Same creation, but no redirect - the wizard
// advances client-side and shows the MCP token in its Claude Code step.
export async function wizardCreateProject(
  _prev: WizardCreateState,
  formData: FormData,
): Promise<WizardCreateState> {
  await assertAuthed();
  const result = await createProjectCore(formData);
  if ("error" in result) return result;
  // The landing hero stashes the typed domain in pending_domain so step 1
  // prefills once - but it's a 7-day cookie and was never cleared, so it
  // lingered and pre-filled a STALE domain on every later signup. The site now
  // exists; drop it so the next signup starts with a clean field.
  (await cookies()).delete("pending_domain");
  return { ok: true, ...result };
}

// The dashboard's add-site dialog. Same creation as the wizard's step 1, then
// it parks the new project on the screen that FOLLOWS step 1 so the caller can
// send the owner straight into the wizard to finish - GitHub, Search Console,
// publish mode, pipeline install.
//
// A site is not "added" when its row exists. Without the pipeline installed it
// has no workflows, so nothing researches, builds, or publishes for it - it
// just sits in the switcher looking real. So the dialog deliberately does not
// stop at the row: creating and setting up are one act, and the owner is never
// handed a half-made project plus a list of things to go do.
//
// The stamp is what makes the hand-off land correctly. Cloud is already safe
// (buildCloudResume forces c1 whenever github_repo is null), but self-host
// resume defaults to s5 - the LAST screen - for a project with a repo and no
// saved screen, which would skip Search Console and the install entirely.
export async function addSiteAndStartSetup(
  _prev: WizardCreateState,
  formData: FormData,
): Promise<WizardCreateState> {
  await assertAuthed();
  const result = await createProjectCore(formData);
  if ("error" in result) return result;
  // createProjectCore already pointed the dash_project cookie at the new row,
  // so this scopes to it. Tolerated, not awaited on: a pre-0030 database has
  // no onboarding_screen column, and losing the stamp costs a resume nicety,
  // never the creation the owner just paid attention to.
  try {
    await db()
      .from("projects")
      .update({ onboarding_screen: isCloudMode() ? "c1" : "s1" })
      .eq("slug", result.slug);
  } catch {
    // resume falls back to its own defaults
  }
  (await cookies()).delete("pending_domain");
  return { ok: true, ...result };
}

// Header mode switch: flips the active project between semi-automatic (the
// owner approves ideas and merges PRs) and automatic (fully hands-off
// publishing). Picking a preset also writes its flag values so the row always
// reads coherently. Enforcement lives with the consumers: the MCP converts
// agent approvals to pending when the type's approval flag is off
// (auto_approve for guides, auto_approve_tools for tools), and the project
// repo's CI asks /api/project-mode before building or merging.
export async function setProjectMode(mode: "semi" | "auto", slug: string) {
  await assertAuthed();
  if (mode !== "semi" && mode !== "auto") throw new Error("Bad mode");
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("Unknown project.");
  if (isCloudMode()) await assertProjectOwned(project.id);
  const preset = mode === "auto" ? AUTO_PRESET : SEMI_PRESET;
  let { error } = await db()
    .from("projects")
    .update({ mode, ...preset })
    .eq("id", project.id);
  if (error && error.message.includes("auto_approve_tools")) {
    // 0028 not applied yet: drop the new flag and retry so the mode switch
    // still works in that window (effectiveAutomations defaults it to true).
    const retry: Record<string, unknown> = { mode, ...preset };
    delete retry.auto_approve_tools;
    ({ error } = await db().from("projects").update(retry).eq("id", project.id));
  }
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Corrects the site's launch date (Settings). It feeds the site-age readout
// (Journey, pacing.ts's siteAgeDays; the pace itself is flat one-guide-a-day
// and no longer age-based) - migration 0015 backfills it from created_at,
// which is only right for sites that went live the day they joined.
export async function setSiteLaunchedAt(date: string, slug: string) {
  await assertAuthed();
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
    throw new Error("Launch date must be a valid date in the past");
  }
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("Unknown project.");
  if (isCloudMode()) await assertProjectOwned(project.id);
  const { error } = await db()
    .from("projects")
    .update({ site_launched_at: parsed.toISOString() })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Per-automation toggle on the Automations page. The mode label is derived:
// a flag set matching a preset IS that preset ("check everything from semi
// and you're simply auto"), anything else shows as "custom" in the topbar.
export async function setAutomationToggle(
  flag: keyof AutomationFlags,
  enabled: boolean,
  slug: string,
) {
  await assertAuthed();
  const allowed: (keyof AutomationFlags)[] = [
    "auto_approve",
    "auto_approve_tools",
    "auto_build_guides",
    "auto_build_tools",
    "auto_merge",
  ];
  if (!allowed.includes(flag)) throw new Error("Bad automation flag");
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("Unknown project.");
  if (isCloudMode()) await assertProjectOwned(project.id);
  const next = { ...effectiveAutomations(project), [flag]: Boolean(enabled) };
  let { error } = await db()
    .from("projects")
    .update({ mode: modeForFlags(next), ...next })
    .eq("id", project.id);
  if (error && error.message.includes("auto_approve_tools")) {
    // 0028 not applied yet: drop the new flag and retry (the read side already
    // defaults it to true via effectiveAutomations).
    const retry: Record<string, unknown> = { mode: modeForFlags(next), ...next };
    delete retry.auto_approve_tools;
    ({ error } = await db().from("projects").update(retry).eq("id", project.id));
  }
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Which coding agent runs this project's unattended builders. Backed by the
// set_agent MCP tool, and both call setProjectAgent so the two faces of this
// cannot drift. Returns the follow-up task (usually "add the new agent's key")
// rather than swallowing it - a switch that quietly leaves the builders unable
// to run is the failure this whole feature is built to avoid.
export async function setAgent(agentId: string, slug: string): Promise<{ todo: string | null }> {
  await assertAuthed();
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("Unknown project.");
  if (isCloudMode()) await assertProjectOwned(project.id);
  const res = await setProjectAgent(project, agentId);
  revalidatePath("/", "layout");
  return { todo: res.todo };
}

// Internal back-linking: may the guide builder EDIT already-published posts so
// they link to a new guide? Deliberately its own action rather than another
// entry in setAutomationToggle - the automation flags answer "how much do I
// automate", and switching a project to Auto must never silently grant
// permission to rewrite pages the owner already shipped. Same reason it lives
// outside AutomationFlags in projects.ts. Backed by the set_internal_linking
// MCP tool so the agent has parity.
export async function setInternalLinking(enabled: boolean, slug: string) {
  await assertAuthed();
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("Unknown project.");
  if (isCloudMode()) await assertProjectOwned(project.id);
  const { error } = await db()
    .from("projects")
    .update({ internal_linking: Boolean(enabled) })
    .eq("id", project.id);
  // A DB that hasn't run 0045 yet: report it instead of pretending the toggle
  // saved. The read path already resolves the missing column to OFF, so the
  // honest message is "run the migration", not a silent no-op.
  if (error) {
    if (error.message.includes("internal_linking")) {
      throw new Error(
        "This database hasn't run migration 0045 yet, so internal linking can't be enabled. Apply supabase/migrations/0045_project_internal_linking.sql and try again.",
      );
    }
    throw new Error(error.message);
  }
  revalidatePath("/", "layout");
}

// The Instructions page's template controls (block toggles, shape rotation,
// house rules). saveContentPrefs normalizes and validates; the same lib call
// backs the set_content_prefs MCP tool.
export async function setContentPrefs(prefs: unknown, slug: string) {
  await assertAuthed();
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("Unknown project.");
  if (isCloudMode()) await assertProjectOwned(project.id);
  const { error } = await saveContentPrefs(project, prefs);
  if (error) throw new Error(error);
  revalidatePath("/instructions");
}

// ---- cloud onboarding: GitHub App + Claude token + zero-touch install ------

export type ChooseRepoState = { ok: true; repo: string } | { error: string } | null;

// The cloud wizard's repo picker (c1): the App is installed, several repos
// are in scope, the owner picks one. Re-validated against the LIVE
// installation repo list - a stale or tampered client payload can only ever
// select a repo the installation really covers. Same logic backs the
// set_github_repo MCP tool.
export async function chooseGithubRepo(
  _prev: ChooseRepoState,
  formData: FormData,
): Promise<ChooseRepoState> {
  await assertAuthed();
  if (!isCloudMode()) return { error: "Self-host connects the repo in step 1 instead." };
  const repo = String(formData.get("repo") ?? "").trim();
  if (!repo) return { error: "Pick a repository." };
  // Explicit slug, like runPipelineInstall and connectClaudeToken: this is the
  // step that pairs a site with a repository, and every later write follows
  // that pairing, so a guessed project here misdirects everything downstream.
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return { error: "No site specified - reload the page and try again." };
  const project = await getProjectBySlug(slug);
  if (!project) return { error: "Unknown project." };
  await assertProjectOwned(project.id);
  if (!project.github_installation_id) {
    return { error: "Install the DispatchSEO GitHub App first." };
  }
  const { listInstallationRepos } = await import("@/lib/github-app");
  let repos: Array<{ full_name: string }>;
  try {
    repos = await listInstallationRepos(project.github_installation_id);
  } catch {
    return { error: "Could not reach GitHub - try again." };
  }
  if (!repos.some((r) => r.full_name === repo)) {
    return { error: "That repository is not part of your DispatchSEO installation." };
  }
  const { error } = await db().from("projects").update({ github_repo: repo }).eq("id", project.id);
  if (error) return { error: error.message };
  await captureServer((await currentUser())?.id ?? project.id, "github_connected", { repo });
  revalidatePath("/onboarding");
  return { ok: true, repo };
}

export type ConnectClaudeState = { ok: true } | { error: string } | null;

// The cloud wizard's one unavoidable paste: the owner's `claude setup-token`
// output, written straight into their repo as the CLAUDE_CODE_OAUTH_TOKEN
// Actions secret via the App. Shape-checked only (no local Claude session
// exists here to live-verify against) - the pack's seo-token-check workflow
// verifies it for real right after the setup dispatch. Nothing is persisted
// on our side: the plaintext lives for this request alone.
export async function connectClaudeToken(
  _prev: ConnectClaudeState,
  formData: FormData,
): Promise<ConnectClaudeState> {
  await assertAuthed();
  if (!isCloudMode()) return { error: "Self-host stores the token during the terminal setup instead." };
  // Strip ALL whitespace, not just trim: terminals line-wrap long tokens and
  // the copied text carries a real newline mid-token (the known VS Code
  // terminal gotcha).
  const token = String(formData.get("token") ?? "").replace(/\s+/g, "");
  // Explicit slug, same reasoning as runPipelineInstall - and with more at
  // stake: this puts the owner's agent credential into a repository as an
  // Actions secret, so resolving the target from a forgiving active-project
  // lookup could plant it in a repo they never chose.
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return { error: "No site specified - reload the page and try again." };
  const project = await getProjectBySlug(slug);
  if (!project) return { error: "Unknown project." };
  await assertProjectOwned(project.id);
  // Which credential this is depends on the project's agent, and the secret it
  // lands in has to match - storing an OpenAI key as CLAUDE_CODE_OAUTH_TOKEN
  // would pass every check here and fail on the first build.
  const agent = agentById(formData.get("agent")?.toString() || projectAgent(project).id);
  if (!token) return { error: `Paste your ${agent.displayName} credential. ${agent.credential.howToMint}` };
  const verified = await verifyAgentCredential(agent.id, token);
  if ("error" in verified) return { error: verified.error };
  const { setRepoSecret } = await import("@/lib/github-app-secrets");
  const res = await setRepoSecret(project, agent.credential.repoSecretName, token);
  if (!res.ok) return { error: `Could not store the credential on your repo: ${res.error}` };
  revalidatePath("/onboarding");
  return { ok: true };
}

export type ConnectBuilderTokenState = { ok: true } | { error: string } | null;

// Self-host / docker sibling of connectClaudeToken: the owner pastes their
// `claude setup-token` output on the dashboard's automatic-builds step and it
// is stored encrypted in instance_settings (0037). /api/builder/jobs hands it
// to the builder container in its poll feed (builderClaudeToken), so nobody
// edits .env or hunts for the install folder - the last terminal step of the
// docker install, gone. Shape-checked only (no local Claude session exists to
// live-verify against); the builder's first poll proves liveness and the
// finale's "Automatic builds" row flips green off its heartbeat.
export async function connectBuilderToken(
  _prev: ConnectBuilderTokenState,
  formData: FormData,
): Promise<ConnectBuilderTokenState> {
  await assertAuthed();
  if (isCloudMode()) {
    return { error: "The hosted version runs builds on GitHub, not a local builder container." };
  }
  // Strip ALL whitespace, not just trim: pasted tokens line-wrap and can carry
  // a real newline mid-token (the known terminal-copy gotcha).
  const token = String(formData.get("token") ?? "").replace(/\s+/g, "");
  // Self-host stores ONE credential per agent at instance level, and which
  // column it lands in comes from the registry - the stack can host a Claude
  // project and a Codex project at once, and /api/builder/jobs resolves the
  // right one per job.
  const agent = agentById(formData.get("agent")?.toString() || "claude");
  if (!token) return { error: `Paste your ${agent.displayName} credential. ${agent.credential.howToMint}` };
  const verified = await verifyAgentCredential(agent.id, token);
  if ("error" in verified) return { error: verified.error };
  const enc = await encryptSecret(token);
  const { data, error } = await db()
    .from("instance_settings")
    .update({ [agent.credential.instanceSettingsColumn]: enc })
    .eq("id", true)
    .select("id");
  if (error) {
    return {
      error: /builder_claude_token|builder_openai_key|column/i.test(error.message)
        ? "This install predates the migration that added builder credentials - re-run start.sh once to apply it, then try again."
        : error.message,
    };
  }
  if (!data || data.length === 0) {
    return {
      error: `This install is configured through environment variables - set ${agent.credential.envVar} in your .env instead.`,
    };
  }
  bustInstanceCache();
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return { ok: true };
}

// The cloud finale's install trigger (c5): commits the pipeline pack into
// the connected repo through the App and fires the seo-setup workflow.
// Idempotent - c5 re-fires it on every mount/resume and each step tolerates
// having already happened (an up-to-date repo skips straight to the setup
// dispatch).
//
// Takes the slug EXPLICITLY rather than reading getActiveProject(). This
// writes to a customer's repository, and active-project resolution is
// deliberately forgiving: getActiveProjectOrNull falls back to the owner's
// first project when the dash_project cookie doesn't match one, so a stale or
// missing cookie silently retargets it. Forgiving is right for rendering a
// dashboard and wrong for committing files - a caller that cannot say which
// project it means must fail, not guess. The wizard always knows: it is
// mid-flow for exactly one project (2026-07-26).
export async function runPipelineInstall(
  slug: string,
): Promise<
  | {
      ok: true;
      mode: string;
      pr_url?: string;
      setup_dispatched: boolean;
      // Passed through so the finale can name the ACTUAL reason setup didn't
      // start. Without it the wizard showed one catch-all line ("your token is
      // still verifying in the background") for two unrelated states, and it
      // was the wrong story for the common one: no token on the repo means
      // nothing is verifying and nothing ever will, so "wait a few minutes,
      // then retry" sent people to wait out a dead end.
      claude_token_present: boolean;
    }
  | { error: string }
> {
  await assertAuthed();
  if (!isCloudMode()) return { error: "Self-host installs via the terminal setup command." };
  if (!slug) return { error: "No project specified for the install." };
  const project = await getProjectBySlug(slug);
  if (!project) return { error: "Unknown project." };
  await assertProjectOwned(project.id);
  // Reaching the finale is what unlocks the dashboard (onboarding-gate keys
  // on onboarding_screen === "c5"), and this action fires on every finale
  // arrival - so stamp the screen HERE, server-side, not only via the
  // wizard's fire-and-forget setWizardScreen POST. That POST is exactly the
  // kind a full-page navigation can cancel (the c1 install-link gotcha of
  // 2026-07-23), and losing it would bounce "Explore your dashboard" back
  // into the wizard. Errors are ignored like setWizardScreen's: on a
  // pre-0030 database the gate grandfathers screenless rows anyway.
  await db().from("projects").update({ onboarding_screen: "c5" }).eq("id", project.id);
  if (project.pipeline_installed_at) {
    return { ok: true, mode: "already-installed", setup_dispatched: true, claude_token_present: true };
  }
  const { installPipelineToRepo } = await import("@/lib/pipeline-install");
  // installPipelineToRepo returns {ok:false} for handled failures, but it can
  // still THROW - installationToken() rejects on a malformed/expired App key,
  // getPipelinePack() can throw, and any fetch can reject on a network fault.
  // A throw here rejects the server action, which the finale's startInstall
  // transition does not catch: installResult stays null while installPending
  // flips back to false, so renderInstallBanner returns NULL and the owner is
  // left staring at an empty box - no error, no Retry, no way to tell that the
  // install of their pipeline just died (2026-07-27).
  let result: Awaited<ReturnType<typeof installPipelineToRepo>>;
  try {
    result = await installPipelineToRepo(project);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!result.ok) return { error: result.error ?? "install failed" };
  await captureServer((await currentUser())?.id ?? project.id, "pipeline_installed", {
    mode: result.mode ?? "direct",
  });
  return {
    ok: true,
    mode: result.mode ?? "direct",
    pr_url: result.pr_url,
    setup_dispatched: result.setup_dispatched,
    claude_token_present: result.claude_token_present,
  };
}

export type WizardGscPropertyState = { ok: true } | { error: string } | null;

// The cloud wizard's inline property picker (c3): corrects onboarding's
// `sc-domain:` guess to the property the connected Google account really
// has. Validated against the live property list, same as /google's button;
// setTrackedProperty is also the set_gsc_property MCP tool's backing call.
//
// Takes the slug explicitly, same reasoning as runPipelineInstall/
// connectClaudeToken/chooseGithubRepo just above: this is a wizard step,
// mid-flow for exactly one project, and getActiveProject()'s cookie fallback
// is forgiving-by-design for rendering, not for picking which project's GSC
// property gets overwritten.
export async function wizardSetGscProperty(
  _prev: WizardGscPropertyState,
  formData: FormData,
): Promise<WizardGscPropertyState> {
  await assertAuthed();
  const siteUrl = String(formData.get("site_url") ?? "").trim();
  if (!siteUrl) return { error: "Pick a property." };
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { error: "No project specified." };
  const project = await getProjectBySlug(slug);
  if (!project) return { error: "Unknown project." };
  if (isCloudMode()) await assertProjectOwned(project.id);
  if (!project.gsc_oauth_refresh_token) {
    return { error: "Connect Google first - then pick the property." };
  }
  const { oauthListSites, setTrackedProperty } = await import("@/lib/gsc-oauth");
  let sites: Array<{ siteUrl: string }>;
  try {
    sites = await oauthListSites(project.gsc_oauth_refresh_token);
  } catch {
    return { error: "Could not read your Search Console properties - try again." };
  }
  if (!sites.some((s) => s.siteUrl === siteUrl)) {
    return { error: "That property is not on the connected Google account." };
  }
  const err = await setTrackedProperty(project.id, siteUrl);
  if (err) return { error: err };
  await captureServer((await currentUser())?.id ?? project.id, "gsc_connected");
  revalidatePath("/onboarding");
  revalidatePath("/google");
  return { ok: true };
}

// The no-state install path: someone added the App from github.com directly
// (Marketplace, org settings), so the callback couldn't tie the installation
// to a project. The onboarding page renders a chooser; this attaches the
// verified installation to the picked project - and connects the repo too
// when the installation covers exactly one.
export async function attachGithubInstallation(projectSlug: string, installationId: number) {
  await assertAuthed();
  if (!isCloudMode()) throw new Error("Cloud only");
  // Prove this browser received GitHub's install redirect for this installation
  // (the callback set a signed nonce cookie). Without it a signed-in attacker
  // could guess a victim's fresh, enumerable installation_id and bind it to
  // their own project. Connect-button installs carry signed state and attach in
  // the callback, never reaching this action.
  const jar = await cookies();
  const nonce = jar.get("gh_install_nonce")?.value;
  const { verifyInstallNonce } = await import("@/lib/github-app");
  if (!nonce || !(await verifyInstallNonce(nonce, installationId))) {
    throw new Error(
      "This GitHub install link isn't valid for your session or has expired. Re-install the app from your dashboard's setup step.",
    );
  }
  const project = await getProjectBySlug(projectSlug);
  if (!project) throw new Error("Unknown project");
  await assertProjectOwned(project.id);
  // Installation ids are enumerable integers - refuse one already bound to
  // another tenant (see assertInstallationClaimable).
  await assertInstallationClaimable(installationId);
  const { getInstallation, installationClaimable, listInstallationRepos } = await import(
    "@/lib/github-app"
  );
  // Same freshness/suspension gate the callback applies (github-app.ts):
  // GitHub's setup redirect is unsigned, so an installation that is merely
  // "real and unattached" is not proof of anything - it also describes every
  // abandoned, suspended, or repo-removed orphan sitting claimable forever.
  const installation = await getInstallation(installationId);
  if (!installation || !installationClaimable(installation)) {
    throw new Error(
      "That GitHub installation isn't available to connect. Install the DispatchSEO App from your dashboard's setup step and come straight back.",
    );
  }
  const row: Record<string, unknown> = {
    github_installation_id: installationId,
    github_app_installed_at: new Date().toISOString(),
  };
  try {
    const repos = await listInstallationRepos(installationId);
    if (repos.length === 1 && !project.github_repo) row.github_repo = repos[0].full_name;
  } catch {
    // repo list is a nicety here - the wizard's picker covers it
  }
  const { error } = await db().from("projects").update(row).eq("id", project.id);
  if (error) throw new Error(error.message);
  jar.delete("gh_install_nonce"); // single-use
  revalidatePath("/onboarding");
  redirect("/onboarding");
}
