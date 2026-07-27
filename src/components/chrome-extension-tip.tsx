"use client";

import { useEffect, useState } from "react";

// One-time nudge inside "Get it on Google": the browser command in step 1
// only works if Claude for Chrome is installed. There's no way to detect the
// extension from a webpage (its externally_connectable is locked to
// *.claude.ai), so this is dismiss-and-remember rather than auto-hiding -
// per-browser via localStorage, since having the extension is a fact about
// the browser, not the project.
const KEY = "dispatch-chrome-ext-tip-dismissed";

export function ChromeExtensionTip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;
  return (
    <p className="flex items-start justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-2 text-xs text-neutral-400">
      <span>
        Don&apos;t have the extension yet?{" "}
        <a
          href="https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
        >
          Add Claude for Chrome
        </a>{" "}
        - one click, then come back and paste the command above.
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem(KEY, "1");
          setVisible(false);
        }}
        className="shrink-0 cursor-pointer rounded p-0.5 text-neutral-500 transition-colors hover:text-neutral-200"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
        </svg>
      </button>
    </p>
  );
}
