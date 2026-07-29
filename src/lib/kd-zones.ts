// The research quality bar's dynamic KD zones, as code.
//
// The CANONICAL statement of these numbers is the instructions' quality bar
// (src/lib/instructions/core.ts): the agent reads them there as prose and
// applies them itself. This module exists so the DASHBOARD can explain a
// pending row using the same numbers the agent decided by - "KD 17, over your
// ceiling of 10" - instead of leaving the owner to guess why research proposed
// an idea and then declined to approve it.
//
// Keep the two in sync. Editing the table in core.ts without editing this one
// makes the dashboard state a reason the agent did not actually apply.

export type KdZones = {
  /** Under this KD, research approves a guide on its own. */
  autoApprove: number;
  /** Up to this KD, research proposes but leaves the call to the owner. */
  pending: number;
};

/**
 * A null/undefined DR means not indexed yet, or the weekly domain-rating cron
 * has not run its first pass - the quality bar treats both as DR 0, so this
 * does too.
 */
export function kdZones(dr: number | null | undefined): KdZones {
  const d = dr ?? 0;
  if (d >= 35) return { autoApprove: 35, pending: 45 };
  if (d >= 20) return { autoApprove: 25, pending: 35 };
  if (d >= 10) return { autoApprove: 15, pending: 25 };
  return { autoApprove: 10, pending: 20 };
}
