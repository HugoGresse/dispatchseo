// Consent gate for the browser-side analytics that are not strictly necessary.
//
// WHY THIS EXISTS. PostHog here does autocapture AND session recording, and the
// dashboard identify()s the signed-in user by email - so a recording of someone
// using the product is tied to a named person. Under the ePrivacy Directive,
// storing or reading anything on a visitor's device that isn't strictly
// necessary to deliver a service they asked for needs prior consent, and
// session replay is the textbook example regulators reach for. The app runs in
// Frankfurt and sells into the EU, so this is not a "someday" obligation.
//
// The split this file encodes:
//   - BROWSER-side PostHog (cookies, localStorage, autocapture, replay) is
//     gated on consent. It does not load until the visitor says yes.
//   - SERVER-side product events (posthog-server.ts: signup, checkout, project
//     created) are NOT gated here. They store nothing on the device and read
//     nothing from it, so ePrivacy's consent rule doesn't reach them; they run
//     on legitimate interest and are disclosed in the privacy policy.
//   - Sentry is NOT gated. It sets no cookie, records no sessions, and is
//     configured without sendDefaultPii - error reporting to keep the service
//     working is legitimate interest, and gating it would mean the crashes
//     worth fixing are exactly the ones we never hear about.
//
// Declining must cost the visitor nothing. Nothing in the product reads this
// value to decide what to render.

export const CONSENT_KEY = "ds_analytics_consent";

// Fired on the window when the choice changes, so components mounted before
// the visitor answered (PostHogIdentify, most importantly) can react without a
// page reload.
export const CONSENT_EVENT = "ds-analytics-consent";

export type ConsentChoice = "granted" | "denied";

// null means "not asked yet" - which is NOT the same as "denied", and is the
// only state that shows the banner.
export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    // Private browsing / storage disabled. Treat as unanswered rather than
    // assuming consent - the safe direction is the one that tracks nobody.
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // If we can't persist it we still honour it for this page's lifetime via
    // the event below; the banner reappears next visit, which is the correct
    // failure mode.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

// True only where a PostHog project is actually configured. Self-hosted
// installs leave the token unset, so they get no analytics and no banner.
export function analyticsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);
}
