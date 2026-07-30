// The feedback form's size limits, in the one module both sides can import.
//
// lib/feedback.ts enforces them and imports db.ts (service role), so a client
// component can never import from it - which previously meant the composer
// carried its own copy of these numbers, free to drift from the rules actually
// being enforced. The failure mode is nasty and quiet: a counter that says
// you're fine over text the server is about to reject.

export const TITLE_MIN = 6;
export const TITLE_MAX = 120;
export const BODY_MAX = 1200;
