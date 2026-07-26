"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type DeleteAccountState } from "@/app/actions";

// Account closure, behind the same confirm-by-typing gate the project delete
// uses - except you type your own email, since that is the thing being
// destroyed. Collapsed by default: this sits under the project danger zone and
// should not be the first red thing the eye lands on.

export function DeleteAccountForm({
  email,
  siteCount,
  subscribed,
}: {
  email: string | null;
  siteCount: number;
  subscribed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccount,
    null,
  );
  const armed = Boolean(email) && typed.trim().toLowerCase() === (email ?? "").toLowerCase();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-red-400 underline underline-offset-2 transition-colors hover:text-red-300"
      >
        Delete my account
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm leading-relaxed text-red-400">
          {state.error}
        </p>
      ) : null}
      <p className="text-sm leading-relaxed text-neutral-400">
        This removes your login and{" "}
        {siteCount === 0
          ? "everything on the account"
          : `${siteCount === 1 ? "your site" : `all ${siteCount} of your sites`} with every keyword, rank, and idea tracked for ${siteCount === 1 ? "it" : "them"}`}
        .{" "}
        {subscribed
          ? "Your plan is cancelled first - if that fails, nothing is deleted."
          : "You have no active plan, so there is nothing to cancel."}{" "}
        {siteCount === 0
          ? ""
          : "DispatchSEO's workflows are removed from every connected repo so nothing keeps running, but published content is left alone. "}
        The live websites themselves keep working. There is no undo.
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm text-neutral-400">
          Type <span className="font-mono text-neutral-200">{email ?? "your email"}</span> to
          confirm
        </span>
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          placeholder={email ?? "you@example.com"}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!armed || pending}
          className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Deleting..." : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          className="text-sm text-neutral-400 transition-colors hover:text-neutral-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
