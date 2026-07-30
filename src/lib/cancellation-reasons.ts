// The cancellation reasons Polar accepts, in the order the form offers them.
//
// Its own module, and deliberately so: the cancel form (a client component)
// renders this list and the server action validates against it, so it has to be
// reachable from both. Living in billing.ts would have pulled that file - and
// through it db.ts and the service-role key - straight into the browser bundle.
// Nothing here may import anything server-only, ever.
export const CANCELLATION_REASONS = [
  "too_expensive",
  "missing_features",
  "unused",
  "too_complex",
  "low_quality",
  "switched_service",
  "customer_service",
  "other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const REASON_LABELS: Record<CancellationReason, string> = {
  too_expensive: "Too expensive",
  missing_features: "Missing features I need",
  unused: "I'm not using it enough",
  too_complex: "Too complicated to use",
  low_quality: "The results weren't good enough",
  switched_service: "Switched to something else",
  customer_service: "Support wasn't good enough",
  other: "Something else",
};
