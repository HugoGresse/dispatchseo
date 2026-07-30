import { db } from "./db";
import { dataforseoBalance } from "./dataforseo-balance";
import type { DataforseoCreds } from "./dataforseo";

// The cron-side setup gate for DataForSEO, twin of gsc-readiness.ts. Same rule
// from CLAUDE.md: an automation may only run against a project whose
// prerequisite is verifiably ready, and incomplete setup is an informational
// skip - never an error, a 500, or an alert email.
//
// The gap this closes: credsForProject() hands back credentials the moment a
// login and password exist. It never asks whether the ACCOUNT HAS MONEY. A
// DataForSEO account starts at $0 until the owner wires the deposit, so
// "credentials saved, nothing funded yet" is the normal state of every project
// between the Connect step and the Fund step on Home - and Home already owns
// it as a setup card (needsFunding, balance < 10).
//
// Left ungated it was loud in the wrong direction. DataForSEO answers an
// unfunded request with a non-20000 top-level status, dataforseoJson throws it,
// and because the code is < 50000 it is not tagged transient, so it gets none
// of the two-run grace: both the rank half and the Domain Rating half set
// hadError, daily-ranks returns HTTP 500, a failed cron_runs row lands, and the
// alert email goes out on the FIRST failure. Every night, forever. On cloud it
// is worse than noisy - `daily-ranks` is a bare instance-wide job name, and
// getCronHealth hides bare names from tenants, so the customer's dashboard shows
// nothing at all while their rank tracking is dead and the operator eats a daily
// email naming that customer's keywords. Loud to the wrong person, silent to the
// right one.
//
// The loudness model, identical to the GSC split:
//   never-worked  -> check the balance; unfunded = quiet skip. The Home "Fund
//                    DataForSEO" card is the user-facing surface.
//   worked-before -> no balance call, run straight; a failure now is a
//                    REGRESSION (account drained, credentials revoked) and
//                    stays loud through the normal banner + email rails.
//
// "Worked before" is any serp_tasks row for the project, NOT any rank_checks
// row: rank_checks is also written by the GSC and SerpApi paths, so a project
// that switched keyword_source to dataforseo would look like DataForSEO had
// worked when it never had. serp_tasks rows are only ever created by a
// DataForSEO task_post that the API accepted, which is exactly the claim being
// tested.

export type DataforseoReadiness = { ready: true } | { ready: false; skipped: string };

// A funded account is anything that can actually transact. Deliberately NOT
// Home's `balance < 10` funding-card threshold: standard-queue rank checks cost
// a fraction of a cent, so pausing a project sitting on $9 would break tracking
// that works fine. The only state being gated here is a wallet that cannot pay
// for a single call.
const MIN_SPENDABLE_USD = 0.01;

export async function dataforseoCronReadiness(
  project: { id: string },
  creds: DataforseoCreds,
): Promise<DataforseoReadiness> {
  // Bundled cloud projects draw on the operator's shared account, which the
  // customer can neither see nor fund. Per-owner spend is already bounded by the
  // tier budget gate and the pacing governor, and a dry shared account is the
  // operator's own regression - platformBalanceAlert() surfaces that once per
  // run. So never gate a tenant on a balance that isn't theirs.
  if (creds.billedTo === "platform") return { ready: true };

  const { count, error } = await db()
    .from("serp_tasks")
    .select("*", { count: "exact", head: true })
    .eq("project_id", project.id);
  if (!error && (count ?? 0) > 0) return { ready: true };

  // Never worked before. user_data is a free endpoint, so this costs nothing.
  const balance = await dataforseoBalance(creds);
  if (balance == null) {
    // Could not read the balance on a project that has never run: skip rather
    // than guess. Mirrors gsc-readiness treating a probe error on a
    // never-worked project as a skip - first-boot noise helps nobody, and a
    // genuine instance-wide credential problem still alarms through any project
    // that HAS worked before.
    return {
      ready: false,
      skipped: "setup incomplete: could not read the DataForSEO balance yet",
    };
  }
  if (balance < MIN_SPENDABLE_USD) {
    return {
      ready: false,
      skipped:
        "setup incomplete: DataForSEO account has no funds yet - add funds from the card on Home; " +
        "rank tracking stays paused until then",
    };
  }
  return { ready: true };
}
