import { db } from "./db";
import { detectPlatform, labelFor, qualifySite, type PlatformResult } from "./site-platform";
import { type AiChoice } from "./qualifier-options";

export type { AiChoice };

// The pre-checkout gate. Two questions, asked before the card is charged:
// what is the site built on, and which AI will drive it. Both are structural -
// a WordPress site has no repo to open a pull request against, and an owner
// with no coding agent has nothing to run the builder - so both were already
// deciding who churns. They were just being asked five minutes too late, on a
// wizard screen that sits past checkout.
//
// EVERYTHING THAT DECIDES "CAN WE SERVE THIS PERSON" LIVES IN THIS FILE, in
// the two tables below. When WordPress publishing lands, one entry flips from
// "building" to "ready" - not a hunt through page components.

/** How far along support for a thing is. Only "ready" reaches checkout. */
type Support = "ready" | "building" | "no";

// --- What the site is built on ------------------------------------------
//
// "building" is not a euphemism for "no": it is the honest state of the
// WordPress publisher while it is being written, and it changes the message
// the owner reads (a date-less "we are building this" rather than a flat
// "never"). No email capture on either - the standing decision is to say it
// isn't supported and let people go, not to farm a waitlist.
const PLATFORM_SUPPORT: Record<string, Support> = {
  nextjs: "ready", // a code-built site: the repo path works today
  static: "ready",
  // Ready since 2026-08-19: connect, crawl, finish, publish and verify all
  // proven end to end against a live site, plus five fixture installs
  // (vanilla, Elementor, Yoast, RankMath, and one with REST locked down).
  // Self-hosted WordPress specifically - a wordpress.com-hosted site still
  // reaches the connect screen, where it fails by name rather than here.
  wordpress: "ready",
  wix: "no",
  squarespace: "no",
  shopify: "no",
  webflow: "no",
  framer: "no",
  // The docs named Ghost unsupported from day one; the detector just couldn't
  // see one, so Ghost owners fell into "unknown" and were waved through to
  // checkout - the exact churn the qualifier exists to prevent.
  ghost: "no",
  unknown: "ready", // we could not tell; our probe is not good enough to refuse someone on
  unreachable: "ready", // ditto - a new domain that is not live yet is a normal case
};

// --- What will drive it --------------------------------------------------

const AI_SUPPORT: Record<AiChoice, Support> = {
  "claude-code": "ready",
  codex: "ready",
  cursor: "ready",
  // ChatGPT's custom-connector behaviour on a Plus plan (URL-key auth? write
  // tools?) is unverified - the hand-test in docs-private decides whether it
  // ships as-is or needs OAuth first. Until that test is recorded, someone
  // whose only AI is ChatGPT genuinely cannot run this.
  chatgpt: "building",
  // Ready since 2026-08-20: the ordinary claude.ai app connects through the
  // same MCP door with ?client=chat, writes on the owner's own subscription,
  // and hands the article to submit_article; our server finishes and
  // publishes it. Publishing goes to WordPress or, for a code-built site, to
  // its GitHub repo as a pull request our server opens - so the chat app
  // needs no coding agent on either platform. LAUNCH GATE: flipped in code
  // ahead of Neo's own claude.ai hand-test (docs-private/
  // claude-connector-test-result.md); do not deploy before that file says
  // PASS.
  "claude-web": "ready",
  // Gemini's consumer app has no way to connect a third-party tool at all
  // (verified 2026-08-18), so this is a structural no, not a roadmap item.
  gemini: "no",
  none: "no",
};

export type QualifierVerdict = {
  ok: boolean;
  /** The single sentence the owner reads first. */
  headline: string;
  /** Why, in their words. One or two sentences, no jargon. */
  detail: string;
  /** True when the blocker is something we are actively building. */
  building: boolean;
};

export function verdictFor(platform: PlatformResult, ai: AiChoice): QualifierVerdict {
  const site = qualifySite(platform);
  const platformSupport = PLATFORM_SUPPORT[platform.platform] ?? "ready";
  const aiSupport = AI_SUPPORT[ai] ?? "no";

  // Platform first: it is the harder wall, and the one both WordPress churns
  // hit. An owner told "WordPress isn't ready" does not also need to hear
  // about agents in the same breath.
  if (platformSupport === "building") {
    return {
      ok: false,
      building: true,
      headline: `We can't set up a ${labelFor(platform.platform)} site yet`,
      detail: site.message,
    };
  }
  if (platformSupport === "no") {
    return {
      ok: false,
      building: false,
      headline: `We don't support ${labelFor(platform.platform)} sites`,
      detail:
        "There's no way for us to publish pages to one. Rather than take your money for a setup that can't finish, we'd rather say so now.",
    };
  }

  if (aiSupport === "building") {
    return {
      ok: false,
      building: true,
      headline: "We can't connect the ChatGPT app yet",
      detail:
        "Right now the work runs through the Claude app or a coding agent (Claude Code, Codex or Cursor). Connecting ChatGPT is being built. If you also have one of those, pick it above and you're good to go.",
    };
  }
  if (aiSupport === "no") {
    return {
      ok: false,
      building: false,
      headline: ai === "gemini" ? "Gemini can't drive this yet" : "You'll need an AI assistant",
      detail:
        ai === "gemini"
          ? "Google's Gemini app has no way to connect an outside tool like ours, so it can't run your SEO. The Claude app, Claude Code, Codex and Cursor all work today."
          : "DispatchSEO doesn't write with our own AI, it drives yours. You'll need the Claude app, Claude Code, Codex or Cursor to use it today.",
    };
  }

  return {
    ok: true,
    building: false,
    headline: "You're set up to use this",
    detail: site.message,
  };
}

// --- Storage -------------------------------------------------------------

export type QualifierRow = {
  id: string;
  user_id: string;
  domain: string;
  platform: string;
  confidence: string | null;
  signals: string[];
  wordpress: Record<string, unknown> | null;
  ai_choice: string;
  verdict: string;
  route: string | null;
  proceeded: boolean;
  created_at: string;
};

/** Run the check and keep the answer. Never throws: a storage hiccup must not
 *  block a signup, so the verdict is still returned when the insert fails. */
export async function runQualifier(
  userId: string,
  domain: string,
  ai: AiChoice,
): Promise<{ platform: PlatformResult; verdict: QualifierVerdict }> {
  const platform = await detectPlatform(domain);
  const verdict = verdictFor(platform, ai);
  const site = qualifySite(platform);
  try {
    await db()
      .from("signup_qualifiers")
      .insert({
        user_id: userId,
        domain: domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""),
        platform: platform.platform,
        confidence: platform.confidence,
        signals: platform.signals,
        wordpress: platform.wordpress ?? null,
        ai_choice: ai,
        verdict: verdict.ok ? "supported" : verdict.building ? "building" : "unsupported",
        route: site.route,
        proceeded: verdict.ok,
      });
  } catch {
    // Counting is valuable; charging correctly is more valuable. Swallow.
  }
  return { platform, verdict };
}

/** The newest answer for this user, or null if they have never been asked.
 *  A DB error reads as "not asked" so a hiccup can never lock someone out of
 *  checkout - the gate is here to stop a doomed signup, not to become one. */
export async function latestQualifier(userId: string): Promise<QualifierRow | null> {
  try {
    const { data, error } = await db()
      .from("signup_qualifiers")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as QualifierRow) ?? null;
  } catch {
    return null;
  }
}
