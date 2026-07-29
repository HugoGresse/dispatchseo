"use client";

import { useState } from "react";

// Per-page agent affordances, top-right of every doc page: copy the page as
// markdown, open the raw .md, or hand it straight to Claude / ChatGPT.
//
// Nothing is bundled - "Copy" fetches /docs/<slug>.md at click time, the same
// file the AI links point at, so there is one source of truth for "this page
// as text" and no duplicated content in the JS payload.

type Props = { slug: string };

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-400 outline-none transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950";

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MarkdownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 15.5v-7l3 3.5 3-3.5v7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 8.5v7m0 0l-2-2.2m2 2.2l2-2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DocsPageActions({ slug }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const mdPath = `/docs/${slug}.md`;
  // Absolute, because the destination is a different origin - an agent on
  // claude.ai cannot resolve a relative path back to this site.
  const mdUrl = `https://dispatchseo.com${mdPath}`;
  const prompt = `Read ${mdUrl} and help me follow it. If I get stuck, the full DispatchSEO docs are at https://dispatchseo.com/llms-full.txt`;

  async function copy() {
    try {
      const res = await fetch(mdPath);
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText(await res.text());
      setState("copied");
    } catch {
      // Clipboard is blocked in some embedded browsers - say so rather than
      // showing a success tick for a copy that never happened.
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className={BTN} aria-live="polite">
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy as Markdown"}
      </button>
      <a href={mdPath} className={BTN}>
        <MarkdownIcon />
        View as Markdown
      </a>
      <a
        href={`https://claude.ai/new?q=${encodeURIComponent(prompt)}`}
        target="_blank"
        rel="noreferrer"
        className={BTN}
      >
        Open in Claude
      </a>
      <a
        href={`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`}
        target="_blank"
        rel="noreferrer"
        className={BTN}
      >
        Open in ChatGPT
      </a>
    </div>
  );
}
