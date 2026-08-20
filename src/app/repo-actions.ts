"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { dashboardAuth } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { assertProjectOwned } from "@/lib/tenant-guard";
import { normalizeContentPathHint } from "@/lib/repo-publish";

// The dashboard's door to repo publishing: where this site keeps its articles.
// ("Publish now" on the repo route is approveDraft in actions.ts - the same
// button, the same shared publishDraftNow, for WordPress and repo alike.)
//
// A file of its own rather than more of actions.ts because it belongs to one
// feature and nothing else in that file touches it - and because the whole
// repo-publishing path should be readable in one sitting.

// Every action re-validates auth server-side - the proxy only does presence
// routing, this is the real check. dashboardAuth covers both modes: the
// dash_auth cookie on self-host, the Supabase session in CLOUD_MODE.
async function assertAuthed() {
  if (!(await dashboardAuth())) {
    throw new Error("Unauthorized");
  }
}

/**
 * "Where your articles live" - the owner's answer to the one question our
 * repo scanner can get wrong.
 *
 * Stored as a hint rather than a setting: the publisher still scores the repo
 * when this is empty, and an owner who names a folder that has since moved
 * gets the scorer's answer rather than a failure. Empty clears it.
 *
 * THROWS rather than returning a message, matching setSelfHostRepo - the
 * settings form is a plain <form action>, which has nowhere to render a
 * returned state, and a refusal that reported success would be the exact lie
 * this codebase keeps banning. The input's own pattern/maxLength enforce all
 * three rules below before a submit ever leaves the browser, so a throw here
 * means somebody posted by hand.
 */
export async function setContentPathHint(formData: FormData): Promise<void> {
  await assertAuthed();
  const project = await getActiveProject();
  await assertProjectOwned(project.id);

  const raw = String(formData.get("content_path_hint") ?? "").trim();
  // One normaliser for the Settings form, the MCP tool and the publisher
  // (repo-publish.ts): leading/trailing slashes stripped, 120 chars, plain
  // path characters, no `..` segment - because this column is the input to
  // a path we later commit at.
  const path = raw ? normalizeContentPathHint(raw) : null;
  if (raw && path === null) throw new Error("Use a plain folder path, like content/blog.");

  const { error } = await db()
    .from("projects")
    .update({ content_path_hint: path })
    .eq("id", project.id);
  if (error) throw new Error("We couldn't save that just now. Try again in a moment.");

  revalidatePath("/settings");
}
