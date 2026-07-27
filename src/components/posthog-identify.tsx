"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Mounted once in the dashboard shell for signed-in CLOUD_MODE users. Links
// whatever anonymous distinct id this browser already has (landing page
// visits, the signup form) to the real Supabase user id - identify() is
// idempotent, so re-firing on every dashboard load is harmless.
export function PostHogIdentify({ userId, email }: { userId: string; email: string | null }) {
  useEffect(() => {
    posthog.identify(userId, email ? { email } : undefined);
  }, [userId, email]);
  return null;
}
