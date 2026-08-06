"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSelfHostRepo } from "@/app/actions";

// Self-host only: the GitHub-repo row on Settings, editable. Cloud keeps a
// read-only row (its repo choice lives with the App installation). Exists
// because the repo used to be writable exactly once, at creation - connect
// the wrong repo (or disconnect to fix one) and the project was stranded
// with no supported way to point it anywhere.
export function RepoRow({ current, slug }: { current: string | null; slug: string }) {
  const initial = current ?? "";
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = value.trim() !== initial && value.trim().length > 0;

  function save() {
    if (!dirty || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await setSelfHostRepo(value.trim(), slug);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <span
        className="text-sm text-neutral-500"
        title="Where content PRs land. Changing it never touches the old repo - use Disconnect below first if the pipeline was installed there."
      >
        GitHub repo
      </span>
      <span className="flex flex-wrap items-center justify-end gap-2">
        <input
          type="text"
          value={value}
          placeholder="owner/repo"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          className="w-56 rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-200 placeholder:text-neutral-600"
        />
        {dirty ? (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        ) : null}
        {error ? <span className="max-w-xs text-xs text-red-400">{error}</span> : null}
      </span>
    </div>
  );
}
