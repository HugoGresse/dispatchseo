"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REPO_NOTICE_COOKIE } from "@/lib/repo-notice";

// Shown once, after a project delete whose repo-side teardown didn't fully
// land. Amber rather than the changelog banner's neutral, because unlike a
// release note this is work still waiting on the owner - something out there
// may still be running under their name.
//
// It always names the repo and always gives the way out, because "cleanup
// partly failed" with no next step is just anxiety. The gh command disables
// every remaining seo-* workflow in one line; the Actions link is for people
// who'd rather click.

export function RepoCleanupBanner({ repo, warnings }: { repo: string; warnings: string[] }) {
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  if (hidden) return null;

  const command = `gh workflow list --repo ${repo} --all --json name,path --jq '.[]|select(.path|startswith(".github/workflows/seo-"))|.name' | while read -r w; do gh workflow disable "$w" --repo ${repo}; done`;

  function dismiss() {
    setHidden(true);
    // Readable-from-JS cookie, so expiring it here is the whole dismissal.
    document.cookie = `${REPO_NOTICE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    router.refresh();
  }

  function copy() {
    void navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard blocked - the command is on screen to select by hand */
      });
  }

  return (
    <div className="border-b border-amber-500/25 bg-amber-500/10 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-start gap-3 text-sm">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="leading-relaxed text-amber-200/90">
            <b className="font-medium text-amber-100">
              The project is deleted, but {repo} wasn&apos;t fully cleaned up.
            </b>{" "}
            {warnings.join(" ")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full overflow-x-auto rounded border border-amber-500/20 bg-neutral-950/60 px-2 py-1 font-mono text-xs text-amber-100/80">
              gh workflow disable ... --repo {repo}
            </code>
            <button
              onClick={copy}
              className="rounded border border-amber-500/30 px-2 py-1 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              {copied ? "Copied" : "Copy full command"}
            </button>
            <a
              href={`https://github.com/${repo}/actions`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-amber-200 underline underline-offset-2 hover:text-amber-100"
            >
              Or disable them on GitHub →
            </a>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss cleanup notice"
          className="shrink-0 rounded p-1 text-amber-500/60 transition-colors hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
