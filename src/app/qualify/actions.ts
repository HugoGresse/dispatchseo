"use server";

import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { isAiChoice } from "@/lib/qualifier-options";
import { runQualifier, type QualifierVerdict } from "@/lib/qualifier";
import { labelFor } from "@/lib/site-platform";

export type QualifyState = {
  domain?: string;
  ai?: string;
  verdict?: QualifierVerdict;
  /** One line naming what we detected, shown small under the verdict. */
  detected?: string;
  error?: string;
} | null;

// Deliberately does NOT redirect on success. The owner reads what we found
// about their own site and clicks through themselves - being bounced straight
// to a pricing table would throw away the one moment where we tell them
// something true about their setup.

export async function submitQualifier(_prev: QualifyState, formData: FormData): Promise<QualifyState> {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) return { error: "Not available on this install." };

  const domain = String(formData.get("domain") ?? "").trim();
  const ai = String(formData.get("ai") ?? "").trim();

  if (!domain) return { domain, ai, error: "Enter your website address." };
  if (!isAiChoice(ai)) return { domain, ai, error: "Pick which AI you use." };
  // Cheap shape check before we spend a fetch on it. Deliberately loose: an
  // exotic but real TLD must not be refused by a regex, so anything with a dot
  // and no spaces gets through to the real probe.
  const host = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!/^[^\s/]+\.[^\s/]+$/.test(host)) {
    return { domain, ai, error: "That doesn't look like a website address. Try something like yoursite.com" };
  }

  try {
    const { platform, verdict } = await runQualifier(auth.user.id, host, ai);
    const bits: string[] = [labelFor(platform.platform)];
    if (platform.wordpress?.version) bits.push(`version ${platform.wordpress.version}`);
    if (platform.wordpress?.elementor) bits.push("Elementor");
    if (platform.wordpress?.seoPlugin) bits.push(platform.wordpress.seoPlugin);
    return { domain: host, ai, verdict, detected: bits.join(", ") };
  } catch {
    // A probe failure must never strand someone mid-signup. Let them through
    // rather than blocking on our own outage - the gate exists to prevent a
    // doomed signup, and it must not become one.
    return {
      domain: host,
      ai,
      verdict: {
        ok: true,
        building: false,
        headline: "We couldn't check your site just now",
        detail:
          "Our check didn't run, which is on us, not your site. You can carry on, and setup will tell you if anything is missing.",
      },
    };
  }
}
