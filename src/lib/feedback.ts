import { db } from "./db";
import { isCloudMode } from "./cloud";
import { BODY_MAX, TITLE_MAX, TITLE_MIN } from "./feedback-limits";

// The product feedback board (migration 0046). One module owns every rule, so
// the dashboard server actions and the MCP tools cannot drift apart - see the
// parity rule in CLAUDE.md.
//
// Two shapes, one table:
//   CLOUD_MODE - the real board. Everyone signed in sees the same list, writes
//                requests, and votes once each.
//   self-host  - one person, so a board is a room with one person in it.
//                The row is still written (rate limiting reads it, and the text
//                survives a failed send), the screen just says thank you, and
//                the request is emailed to the DispatchSEO team.
//
// Server-only: it imports db.ts (service role). Never import from a client
// component.

export type FeedbackStatus = "open" | "planned" | "in_progress" | "shipped" | "declined";

export const STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "shipped", label: "Shipped" },
  { value: "declined", label: "Not planned" },
];

export function isFeedbackStatus(v: string): v is FeedbackStatus {
  return STATUSES.some((s) => s.value === v);
}

export type FeedbackItem = {
  id: string;
  title: string;
  body: string;
  status: FeedbackStatus;
  created_at: string;
  hidden: boolean;
  votes: number;
  /** Did the person asking already vote for this one. */
  voted: boolean;
  /** Did the person asking write it - the board shows "yours" on their own rows. */
  mine: boolean;
};

// ---- what a request is allowed to contain --------------------------------

export { TITLE_MIN, TITLE_MAX, BODY_MAX } from "./feedback-limits";

// Links are rejected outright rather than stripped. A board anyone can post to
// is a link farm waiting to happen - the whole value of a spammed request is
// the URL in it - and silently deleting part of what someone wrote is the kind
// of quiet failure that makes people distrust the form. So: say no, say why.
//
// Bare domains match against an explicit TLD list instead of a generic
// `.<letters>` rule, which would reject perfectly normal requests mentioning
// Node.js, next.config or package.json.
const BARE_DOMAIN_TLDS =
  "com|net|org|io|co|dev|ai|app|xyz|me|info|biz|online|site|shop|store|live|link|click|top|gg|ly|sh|uk|de|fr|ru|cn|in";

// Order matters only for the wording: an address like me@you.com also trips
// the bare-domain rule, so the email test runs first to report the reason the
// person will actually recognize.
const LINK_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, why: "email addresses" },
  { re: /https?:\/\//i, why: "links" },
  { re: /\bwww\./i, why: "links" },
  { re: new RegExp(`\\b[a-z][a-z0-9-]*\\.(?:${BARE_DOMAIN_TLDS})\\b`, "i"), why: "links" },
  { re: /\[[^\]]*\]\s*\(/, why: "links" },
  { re: /<\s*[a-z!/]/i, why: "HTML" },
];

/** The one thing every submission path runs first. Null = the text is fine. */
export function findDisallowed(text: string): string | null {
  for (const { re, why } of LINK_PATTERNS) if (re.test(text)) return why;
  return null;
}

/**
 * Collapse a submission to the plain text we store: no control characters, no
 * runs of blank lines, trimmed. Rendering is plain text everywhere (React
 * escapes by default and nothing here is ever fed to dangerouslySetInnerHTML),
 * so this is about tidiness, not safety - the safety is findDisallowed above.
 */
function cleanText(raw: string): string {
  return raw
    // Control characters, minus the \n and \t we keep - a paste out of a
    // terminal, a PDF or a chat window drags plenty of them along.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export type Validated = { title: string; body: string };

/**
 * Validate + normalize. Throws a message written for the person who typed it -
 * every caller surfaces `err.message` straight into the form.
 */
export function validateSubmission(rawTitle: string, rawBody: string): Validated {
  // A title is one line: newlines become spaces, and runs of whitespace
  // collapse so a padded paste doesn't render with gaps in it.
  const title = cleanText(rawTitle).replace(/\s+/g, " ");
  const body = cleanText(rawBody);
  if (title.length < TITLE_MIN) throw new Error("Give it a title - a few words is plenty.");
  if (title.length > TITLE_MAX) throw new Error(`Titles stop at ${TITLE_MAX} characters.`);
  if (body.length > BODY_MAX) throw new Error(`The detail box stops at ${BODY_MAX} characters.`);
  const bad = findDisallowed(`${title}\n${body}`);
  if (bad) throw new Error(`Plain text only - no ${bad}. Describe it in words instead.`);
  return { title, body };
}

// ---- abuse limits ---------------------------------------------------------

// Deliberately generous for a real person and useless for a script. Both are
// counted in the database rather than in memory: serverless instances are
// recycled constantly, so an in-process counter resets itself into uselessness.
const MAX_SUBMISSIONS_PER_DAY = 5;
const MAX_VOTES_PER_HOUR = 60;

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}

// Self-host has no accounts, so there is no per-user key to count by - every
// row there has a null author, and the whole deployment counts as one person.
async function assertUnderSubmitLimit(userId: string | null): Promise<void> {
  const q = db().from("feedback").select("id", { count: "exact", head: true }).gte("created_at", hoursAgo(24));
  const { count, error } = await (userId ? q.eq("author_user_id", userId) : q.is("author_user_id", null));
  // A limiter that cannot read its own ledger must not become a wall: an
  // unapplied migration or a database blip would otherwise lock everybody out
  // of the form. Fail open and let the write itself report the real problem.
  if (error) return;
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
    throw new Error(
      `That's ${MAX_SUBMISSIONS_PER_DAY} requests today - the daily limit. Add detail to an ` +
        `existing one instead, and come back tomorrow.`,
    );
  }
}

async function assertUnderVoteLimit(userId: string): Promise<void> {
  const { count, error } = await db()
    .from("feedback_votes")
    .select("feedback_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", hoursAgo(1));
  if (error) return;
  if ((count ?? 0) >= MAX_VOTES_PER_HOUR) {
    throw new Error("That's a lot of voting in one hour. Give it a few minutes.");
  }
}

// ---- reading the board ----------------------------------------------------

type Row = {
  id: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
  hidden: boolean;
  author_user_id: string | null;
};

/**
 * The whole board, newest-first from the database and ordered for display here:
 * most-voted first, ties broken by newest. Hidden rows are dropped unless the
 * caller is the owner (`includeHidden`), who needs to see what they hid.
 */
export async function listFeedback(opts: {
  userId?: string | null;
  includeHidden?: boolean;
  limit?: number;
} = {}): Promise<FeedbackItem[]> {
  const { userId = null, includeHidden = false, limit = 300 } = opts;
  let q = db()
    .from("feedback")
    .select("id,title,body,status,created_at,hidden,author_user_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeHidden) q = q.eq("hidden", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // Counted from the votes themselves rather than a cached column - see the
  // note in migration 0046. One query for every vote on the rows we're showing.
  const ids = rows.map((r) => r.id);
  const { data: voteRows } = await db()
    .from("feedback_votes")
    .select("feedback_id,user_id")
    .in("feedback_id", ids);
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const v of (voteRows ?? []) as { feedback_id: string; user_id: string }[]) {
    counts.set(v.feedback_id, (counts.get(v.feedback_id) ?? 0) + 1);
    if (userId && v.user_id === userId) mine.add(v.feedback_id);
  }

  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body ?? "",
      status: (isFeedbackStatus(r.status) ? r.status : "open") as FeedbackStatus,
      created_at: r.created_at,
      hidden: r.hidden,
      votes: counts.get(r.id) ?? 0,
      voted: mine.has(r.id),
      mine: Boolean(userId && r.author_user_id === userId),
    }))
    .sort((a, b) => b.votes - a.votes || +new Date(b.created_at) - +new Date(a.created_at));
}

// ---- writing --------------------------------------------------------------

export type SubmitResult = {
  id: string;
  title: string;
  /** Self-host only: did the request actually reach the DispatchSEO team. */
  emailed: boolean;
  /**
   * Self-host fallback when this deployment has no Resend key configured. A
   * prefilled mailto so the request still gets somewhere - never a silent
   * "thanks!" over a message that went nowhere.
   */
  mailto: string | null;
};

/**
 * Write a request. Same path in both modes; only what happens afterwards
 * differs (cloud shows it on the board, self-host emails it out).
 */
export async function submitFeedback(input: {
  title: string;
  body?: string;
  userId?: string | null;
  email?: string | null;
  projectId?: string | null;
}): Promise<SubmitResult> {
  const { title, body } = validateSubmission(input.title, input.body ?? "");
  const userId = input.userId ?? null;
  await assertUnderSubmitLimit(userId);

  // Same person, same request, same day: almost always a double-submit or a
  // frustrated re-post, and either way a second identical row helps nobody.
  // ilike, so the check is case-insensitive - but % and _ are wildcards to it,
  // and a title containing either would otherwise match half the board and
  // reject a perfectly good request as a duplicate.
  const dupeQ = db()
    .from("feedback")
    .select("id")
    .ilike("title", title.replace(/[\\%_]/g, "\\$&"))
    .gte("created_at", hoursAgo(24))
    .limit(1);
  const { data: dupe } = await (userId
    ? dupeQ.eq("author_user_id", userId)
    : dupeQ.is("author_user_id", null));
  if (dupe && dupe.length > 0) {
    throw new Error("You already sent that one today - it's in.");
  }

  const { data, error } = await db()
    .from("feedback")
    .insert({
      title,
      body,
      author_user_id: userId,
      author_email: input.email ?? null,
      project_id: input.projectId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const id = (data as { id: string }).id;
  const sent = await notifyOwner({ title, body, email: input.email ?? null, userId });
  return { id, title, emailed: sent.emailed, mailto: sent.mailto };
}

async function hasVoted(feedbackId: string, userId: string): Promise<boolean> {
  const { data } = await db()
    .from("feedback_votes")
    .select("feedback_id")
    .eq("feedback_id", feedbackId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Set a vote to exactly on or off. Idempotent, which is what the MCP tool
 * wants - an agent retrying a call must not undo the vote it just cast.
 * Returns the settled state so the caller can stop guessing.
 */
export async function setVote(
  feedbackId: string,
  userId: string,
  vote: boolean,
): Promise<{ voted: boolean; votes: number }> {
  if (!vote) {
    const { error } = await db()
      .from("feedback_votes")
      .delete()
      .eq("feedback_id", feedbackId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  } else {
    await assertUnderVoteLimit(userId);
    const { error } = await db().from("feedback_votes").insert({ feedback_id: feedbackId, user_id: userId });
    // The (feedback_id, user_id) primary key is the one-vote rule. A double
    // click racing itself lands here, and the row it collided with is the
    // caller's own vote - so this is already the state they asked for.
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  }

  const { count } = await db()
    .from("feedback_votes")
    .select("feedback_id", { count: "exact", head: true })
    .eq("feedback_id", feedbackId);
  return { voted: vote, votes: count ?? 0 };
}

/** What the board's vote button does: on if it was off, off if it was on. */
export async function toggleVote(
  feedbackId: string,
  userId: string,
): Promise<{ voted: boolean; votes: number }> {
  return setVote(feedbackId, userId, !(await hasVoted(feedbackId, userId)));
}

/** Owner only. */
export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const { error } = await db()
    .from("feedback")
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Owner only. Hiding, not deleting - see the note in migration 0046. */
export async function setFeedbackHidden(id: string, hidden: boolean): Promise<void> {
  const { error } = await db().from("feedback").update({ hidden }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- who is the owner -----------------------------------------------------

/**
 * The board's moderator: the person the deployment already emails its alerts
 * to. Cloud only - self-host shows no board, so there is nothing to moderate.
 * ALERT_EMAIL may hold a comma-separated list, matching cron-alerts.
 */
export function isFeedbackAdmin(email: string | null | undefined): boolean {
  if (!email || !isCloudMode()) return false;
  const allowed = (process.env.ALERT_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Same question, asked with a user id instead of an email - the MCP server
 * knows which account owns the calling project, never their address. Resolving
 * it needs Supabase's auth admin API, which only exists on a cloud deployment,
 * and isFeedbackAdmin is false off-cloud anyway.
 */
export async function isFeedbackAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId || !isCloudMode()) return false;
  try {
    const { data } = await db().auth.admin.getUserById(userId);
    return isFeedbackAdmin(data?.user?.email ?? null);
  } catch {
    return false;
  }
}

// ---- telling the owner ----------------------------------------------------

// Where a self-hosted install's feedback goes. It cannot go to ALERT_EMAIL -
// that is the self-hoster's own inbox, and mailing someone their own feature
// request is not a feedback channel. Overridable for forks who want their own.
const TEAM_INBOX = process.env.FEEDBACK_EMAIL || "feedback@dispatchseo.com";

function mailtoFor(title: string, body: string): string {
  const subject = encodeURIComponent(`DispatchSEO feature request: ${title}`);
  const text = encodeURIComponent(body ? `${title}\n\n${body}` : title);
  return `mailto:${TEAM_INBOX}?subject=${subject}&body=${text}`;
}

/**
 * Email the request on. Cloud sends to ALERT_EMAIL (the deployment's owner is
 * the person who runs DispatchSEO); self-host sends to the team inbox, since a
 * self-hoster's own alert address is the wrong destination entirely.
 *
 * Best effort in both modes - the row is already written, so a send that fails
 * loses a notification, never the request. Self-host gets a mailto back so the
 * screen can offer a way through instead of claiming a success that didn't
 * happen.
 */
async function notifyOwner(input: {
  title: string;
  body: string;
  email: string | null;
  userId: string | null;
}): Promise<{ emailed: boolean; mailto: string | null }> {
  const cloud = isCloudMode();
  const fallback = cloud ? null : mailtoFor(input.title, input.body);
  const apiKey = process.env.RESEND_API_KEY;
  const to = cloud ? process.env.ALERT_EMAIL : TEAM_INBOX;
  if (!apiKey || !to) return { emailed: false, mailto: fallback };
  // `||` not `??`, same reason as cron-alerts: docker-compose passes this
  // through as `${ALERT_EMAIL_FROM:-}`, so it is present-and-empty, not
  // undefined, and `??` would hand Resend a blank required field.
  const from = process.env.ALERT_EMAIL_FROM || "DispatchSEO <onboarding@resend.dev>";
  const who = input.email ?? (cloud ? "an account with no email on file" : "a self-hosted install");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `DispatchSEO feature request: ${input.title}`.slice(0, 180),
        text:
          `${input.title}\n\n` +
          `${input.body || "(no detail given)"}\n\n` +
          `-- \nFrom: ${who}\n` +
          (cloud
            ? `It is on the board at /feedback, where you can set its status or hide it.`
            : `Sent from a self-hosted DispatchSEO install.`),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { emailed: false, mailto: fallback };
    return { emailed: true, mailto: null };
  } catch {
    return { emailed: false, mailto: fallback };
  }
}
