import { db } from "./db";
import { isCloudMode } from "./cloud";
import { DEFAULT_PROJECT_ID, getProjectById, type Project } from "./projects";
import {
  getSubscription,
  isActive,
  ownerUserIdForProject,
  planGate,
  polarConfigured,
  type Tier,
} from "./billing";

// Bundled DataForSEO on cloud (Workstream C): platform credentials
// (DATAFORSEO_PLATFORM_LOGIN/PASSWORD, see dataforseo.ts's third credsForProject
// branch) bill paid cloud projects that never connected their own account,
// server-side only - see the migration 0035 ledger this module writes and
// reads. Spend is metered per OWNER (not per project - otherwise a 3-site
// Growth plan would triple its real budget) against a flat monthly cap. A
// second, project-scoped cap (CHECK_SERP_DAILY_CAP) keeps the interactive
// check_serp MCP tool from being used as a cheap unlimited SERP proxy.

export const TIER_BUDGET_MICROUSD: Record<Tier, number> = {
  starter: 20_000_000, // $20/mo
  growth: 40_000_000, // $40/mo
  scale: 70_000_000, // $70/mo
};

// Interactive live-SERP checks (the check_serp MCP tool, billed-to-platform
// only) are rate-limited per PROJECT, not metered against the cost budget -
// recordCheckSerpCall writes calls=1/cost=0 rows under this synthetic
// endpoint name so the daily count lives in the same ledger.
export const CHECK_SERP_DAILY_CAP = 30;
const CHECK_SERP_ENDPOINT = "check_serp";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function nextMonthStartUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

// The paid-call metering hook dataforseo.ts's postOnce fires, fire-and-forget,
// for every platform-billed request - a ledger failure must never fail or
// slow down the call it's recording. Rejects on error so the caller's
// `.catch(console.error)` has something to catch; never awaited on the hot path.
export async function recordDataforseoUsage(
  projectId: string,
  endpoint: string,
  costUsd: number,
): Promise<void> {
  const { error } = await db().rpc("record_dataforseo_usage", {
    p_project_id: projectId,
    p_day: todayUtc(),
    p_endpoint: endpoint,
    p_calls: 1,
    p_cost_microusd: Math.round(costUsd * 1_000_000),
  });
  if (error) throw new Error(`record_dataforseo_usage failed: ${error.message}`);
}

// check_serp's own fire-and-forget recorder: cost is always 0 (it's a rate
// limit, not a spend), so a failure here only means the count under-reports -
// never worth surfacing to the caller. Swallows its own errors, unlike
// recordDataforseoUsage above, so `void recordCheckSerpCall(...)` is enough.
export async function recordCheckSerpCall(projectId: string): Promise<void> {
  const { error } = await db().rpc("record_dataforseo_usage", {
    p_project_id: projectId,
    p_day: todayUtc(),
    p_endpoint: CHECK_SERP_ENDPOINT,
    p_calls: 1,
    p_cost_microusd: 0,
  });
  if (error) {
    console.error(`[dataforseo-usage] check_serp record failed for ${projectId}: ${error.message}`);
  }
}

async function checkSerpCallsToday(projectId: string): Promise<number> {
  const { data, error } = await db()
    .from("dataforseo_usage")
    .select("calls")
    .eq("project_id", projectId)
    .eq("day", todayUtc())
    .eq("endpoint", CHECK_SERP_ENDPOINT)
    .maybeSingle();
  if (error || !data) return 0;
  return (data as { calls: number }).calls ?? 0;
}

export async function checkSerpDailyCapReached(projectId: string): Promise<boolean> {
  return (await checkSerpCallsToday(projectId)) >= CHECK_SERP_DAILY_CAP;
}

async function ownedProjectIds(ownerId: string): Promise<string[]> {
  const { data } = await db().from("projects").select("id").eq("owner_user_id", ownerId);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

async function monthToDateCostMicrousd(ownerId: string): Promise<number> {
  const ids = await ownedProjectIds(ownerId);
  if (ids.length === 0) return 0;
  const { data, error } = await db()
    .from("dataforseo_usage")
    .select("cost_microusd")
    .in("project_id", ids)
    .gte("day", monthStartUtc());
  if (error || !data) return 0;
  return (data as Array<{ cost_microusd: number }>).reduce((sum, r) => sum + (r.cost_microusd ?? 0), 0);
}

// Is this project's owner still under their tier's monthly DataForSEO budget?
// Called from dataforseo.ts's credsForProject AFTER planGate already confirmed
// an active subscription covering this site - so an inactive/missing sub here
// fails OPEN (never double-deny), matching planGate's own tolerance. Only
// returns allowed:false in the one case this exists to catch: an active,
// covered cloud subscriber who has spent through this month's budget.
export async function platformBudgetGate(
  projectId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (!isCloudMode() || !polarConfigured()) return { allowed: true };
  const ownerId = await ownerUserIdForProject(projectId);
  if (!ownerId) return { allowed: true };
  const sub = await getSubscription(ownerId);
  if (!isActive(sub)) return { allowed: true };
  const budgetMicrousd = TIER_BUDGET_MICROUSD[sub!.tier];
  const spentMicrousd = await monthToDateCostMicrousd(ownerId);
  if (spentMicrousd >= budgetMicrousd) {
    return {
      allowed: false,
      reason: `DataForSEO usage budget reached for this billing period ($${(budgetMicrousd / 1_000_000).toFixed(2)})`,
    };
  }
  return { allowed: true };
}

// ---- pacing governor -------------------------------------------------------
// The budget gate above is a hard wall: hit it and every paid feature stops
// until the month resets - which for a maxed-out project meant losing rank
// tracking for days or weeks. The governor makes that wall unreachable: the
// daily rank cron asks for the owner's pacing level BEFORE spending, and
// thins its cadence (daily -> every-other-day -> weekly sweep only) as the
// PROJECTED month-end spend approaches the budget. Tracking degrades to
// sparser, never to stopped. Platform-billed projects only - BYO accounts
// spend their own money at full cadence.

export type PacingLevel = "normal" | "slowed" | "weekly";

const PACING_SLOWED_AT = 0.85; // projected spend >= 85% of budget -> every-other-day

export type PacingState = {
  level: PacingLevel;
  projected_usd: number;
  budget_usd: number;
};

const PACING_OPEN: PacingState = { level: "normal", projected_usd: 0, budget_usd: 0 };

// The pacing MATH, split out from the lookups so a caller that already holds
// the spend and budget (platformUsageStatus) can derive the level without
// re-running the same three queries.
function pacingFrom(spentUsd: number, budgetUsd: number): PacingState {
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  // Divide by at least 3 days: on the 1st-2nd a single research run projects
  // to 15-30x itself and would spuriously throttle a healthy account.
  const projectedUsd = (spentUsd * daysInMonth) / Math.max(now.getUTCDate(), 3);
  const level: PacingLevel =
    projectedUsd >= budgetUsd || spentUsd >= budgetUsd
      ? "weekly"
      : projectedUsd >= budgetUsd * PACING_SLOWED_AT
        ? "slowed"
        : "normal";
  return { level, projected_usd: projectedUsd, budget_usd: budgetUsd };
}

export async function platformPacingState(projectId: string): Promise<PacingState> {
  // Same fail-open tolerances as platformBudgetGate: pacing only ever applies
  // to an active, covered cloud subscriber.
  if (!isCloudMode() || !polarConfigured()) return PACING_OPEN;
  const ownerId = await ownerUserIdForProject(projectId);
  if (!ownerId) return PACING_OPEN;
  const sub = await getSubscription(ownerId);
  if (!isActive(sub)) return PACING_OPEN;
  const budgetUsd = TIER_BUDGET_MICROUSD[sub!.tier] / 1_000_000;
  const spentUsd = (await monthToDateCostMicrousd(ownerId)) / 1_000_000;
  return pacingFrom(spentUsd, budgetUsd);
}

// Would this project resolve to platform-billed DataForSEO right now, ignoring
// the live spend gate above? Deliberately separate from credsForProject's real
// decision: a status readout (the dashboard, get_dataforseo_usage) must keep
// reading "platform" and showing 100%+ used even the moment the budget gate
// starts denying live calls - collapsing straight to null there would look
// like the project silently lost its DataForSEO connection instead of hitting
// a usage cap.
// The platform's shared DataForSEO account for bundled cloud billing. A
// dedicated pair (DATAFORSEO_PLATFORM_*) wins - it keeps the platform's shared
// spend on its own invoice/balance for clean reconciliation - but fall back to
// the base DATAFORSEO_* pair so a single funded account can serve every cloud
// tenant without maintaining two env pairs. Server-side only; the one source of
// truth for "which account bundled cloud draws on", shared by credsForProject
// (dataforseo.ts) and platformBalanceAlert (dataforseo-balance.ts) so they can
// never disagree about whether the platform is configured.
export function platformDataforseoEnv(): { login: string; password: string } | null {
  const login = process.env.DATAFORSEO_PLATFORM_LOGIN || process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PLATFORM_PASSWORD || process.env.DATAFORSEO_PASSWORD;
  return login && password ? { login, password } : null;
}

async function resolveBilledTo(project: Project): Promise<"own" | "platform" | null> {
  if (project.dataforseo_login && project.dataforseo_password) return "own";
  if (
    project.id === DEFAULT_PROJECT_ID &&
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD
  ) {
    return "own";
  }
  if (isCloudMode() && platformDataforseoEnv() && (await planGate(project.id)).allowed) {
    return "platform";
  }
  return null;
}

export type PlatformUsageStatus = {
  billed_to: "own" | "platform" | null;
  month_to_date_usd: number;
  budget_usd: number;
  percent_used: number;
  // Straight-line projection of month-end spend, and the cadence level the
  // rank cron is running at because of it (see platformPacingState).
  projected_usd: number;
  pacing: PacingLevel;
  check_serp_today: number;
  check_serp_daily_cap: number;
  resets_at: string;
};

// The one status readout both the get_dataforseo_usage MCP tool and the
// /billing page render from - never used to gate a live call (see
// platformBudgetGate for that).
export async function platformUsageStatus(projectId: string): Promise<PlatformUsageStatus> {
  // Three independent lookups, so start them together rather than in series.
  const [project, ownerId, serpToday] = await Promise.all([
    getProjectById(projectId),
    ownerUserIdForProject(projectId),
    checkSerpCallsToday(projectId),
  ]);
  // Both need a result from above, but not from each other.
  const [billedTo, sub] = await Promise.all([
    project ? resolveBilledTo(project) : null,
    ownerId ? getSubscription(ownerId) : null,
  ]);
  const budgetMicrousd = sub && isActive(sub) ? TIER_BUDGET_MICROUSD[sub.tier] : 0;
  const spentMicrousd = ownerId ? await monthToDateCostMicrousd(ownerId) : 0;
  // Derived from the spend and budget already in hand. Calling
  // platformPacingState here instead would re-run ownerUserIdForProject,
  // getSubscription AND monthToDateCostMicrousd - the last of which is a
  // deliberately un-memoized spend counter, so it is a real repeat query.
  // The guard mirrors that function's own fail-open conditions exactly.
  const pacing =
    isCloudMode() && polarConfigured() && ownerId && isActive(sub)
      ? pacingFrom(spentMicrousd / 1_000_000, budgetMicrousd / 1_000_000)
      : PACING_OPEN;

  return {
    billed_to: billedTo,
    month_to_date_usd: spentMicrousd / 1_000_000,
    budget_usd: budgetMicrousd / 1_000_000,
    percent_used: budgetMicrousd > 0 ? Math.round((spentMicrousd / budgetMicrousd) * 100) : 0,
    projected_usd: pacing.projected_usd,
    pacing: pacing.level,
    check_serp_today: serpToday,
    check_serp_daily_cap: CHECK_SERP_DAILY_CAP,
    resets_at: nextMonthStartUtc(),
  };
}
