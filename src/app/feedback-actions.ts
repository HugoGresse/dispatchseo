"use server";

import { revalidatePath } from "next/cache";
import { dashboardAuth } from "@/lib/auth-gate";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { isCloudMode } from "@/lib/cloud";
import {
  isFeedbackAdmin,
  isFeedbackStatus,
  setFeedbackHidden,
  setFeedbackStatus,
  submitFeedback,
  toggleVote,
} from "@/lib/feedback";

// Server actions behind the /feedback screen. All of them return a result
// object instead of throwing: a thrown error in a production build reaches the
// browser as "An error occurred in the Server Components render" with the real
// message stripped, and the real message here is the whole point - "no links",
// "that's today's limit" is what tells someone how to fix their submission.

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function failed(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, error: msg || "Something went wrong. Try again." };
}

// Every action re-checks auth server-side; the page's own gate only decides
// what to render, and an action is reachable without ever loading that page.
async function requireAuth() {
  const auth = await dashboardAuth();
  if (!auth) throw new Error("Unauthorized");
  return auth;
}

async function requireAdmin() {
  const auth = await requireAuth();
  if (!isFeedbackAdmin(auth.user?.email)) throw new Error("Unauthorized");
  return auth;
}

export async function submitFeedbackAction(
  title: string,
  body: string,
): Promise<ActionResult<{ emailed: boolean; mailto: string | null }>> {
  try {
    const auth = await requireAuth();
    // Attribution only - which site they were looking at when they wrote it.
    // Never a filter on the board, and a null here is fine.
    const project = await getActiveProjectOrNull();
    const res = await submitFeedback({
      title,
      body,
      userId: auth.user?.id ?? null,
      email: auth.user?.email ?? null,
      projectId: project?.id ?? null,
    });
    revalidatePath("/feedback");
    return { ok: true, data: { emailed: res.emailed, mailto: res.mailto } };
  } catch (e) {
    return failed(e);
  }
}

export async function toggleVoteAction(
  id: string,
): Promise<ActionResult<{ voted: boolean; votes: number }>> {
  try {
    const auth = await requireAuth();
    // Voting needs an account to be one-per-person, and only CLOUD_MODE has
    // accounts. Self-host never renders a board, so this is a direct-call guard.
    if (!isCloudMode() || !auth.user) throw new Error("Voting needs an account.");
    const res = await toggleVote(id, auth.user.id);
    revalidatePath("/feedback");
    return { ok: true, data: res };
  } catch (e) {
    return failed(e);
  }
}

export async function setFeedbackStatusAction(id: string, status: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!isFeedbackStatus(status)) throw new Error("Unknown status.");
    await setFeedbackStatus(id, status);
    revalidatePath("/feedback");
    return { ok: true, data: undefined };
  } catch (e) {
    return failed(e);
  }
}

export async function setFeedbackHiddenAction(id: string, hidden: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await setFeedbackHidden(id, hidden);
    revalidatePath("/feedback");
    return { ok: true, data: undefined };
  } catch (e) {
    return failed(e);
  }
}
