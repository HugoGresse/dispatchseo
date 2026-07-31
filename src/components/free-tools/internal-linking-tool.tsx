"use client";

// The Internal Linking Tool widget: paste in a few pages, get back concrete
// "link this to that, with this anchor text" suggestions. Everything runs in
// this component - no fetch, no backend, nothing pasted ever leaves the
// browser. See src/lib/internal-linking-analysis.ts for the scoring itself;
// this file is just state + the paste-list/results UI around it.

import { useState } from "react";
import {
  analyzeInternalLinks,
  wordCount,
  MIN_CONTENT_WORDS,
  type LinkPage,
  type LinkSuggestion,
} from "@/lib/internal-linking-analysis";

type PageEntry = { id: string; url: string; title: string; content: string };

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

function emptyPage(id: string): PageEntry {
  return { id, url: "", title: "", content: "" };
}

export function InternalLinkingTool() {
  const [pages, setPages] = useState<PageEntry[]>(() => [emptyPage("p1"), emptyPage("p2")]);
  const [nextId, setNextId] = useState(3);
  const [results, setResults] = useState<LinkSuggestion[] | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filledCount = pages.filter((p) => p.content.trim().length > 0).length;
  const canAnalyze = filledCount >= 2;

  function updatePage(id: string, patch: Partial<PageEntry>) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setResults(null);
  }
  function addPage() {
    setPages((prev) => [...prev, emptyPage(`p${nextId}`)]);
    setNextId((n) => n + 1);
  }
  function removePage(id: string) {
    setPages((prev) => (prev.length <= 2 ? prev : prev.filter((p) => p.id !== id)));
    setResults(null);
  }
  function analyze() {
    const usable: LinkPage[] = pages
      .filter((p) => p.content.trim().length > 0)
      .map((p, i) => ({
        id: p.id,
        url: p.url.trim() || `Page ${i + 1}`,
        title: p.title.trim(),
        content: p.content,
      }));
    setResults(analyzeInternalLinks(usable));
  }
  function copySuggestion(s: LinkSuggestion) {
    const key = `${s.fromId}-${s.toId}`;
    navigator.clipboard.writeText(`[${s.anchor}](${s.toUrl})`).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {pages.map((p, i) => (
          <PageCard
            key={p.id}
            index={i}
            page={p}
            canRemove={pages.length > 2}
            onChange={(patch) => updatePage(p.id, patch)}
            onRemove={() => removePage(p.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addPage}
          className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
        >
          + Add another page
        </button>
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={analyze}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Find internal links
        </button>
        {!canAnalyze ? (
          <span className="text-sm text-neutral-500">Paste in at least 2 pages to analyze.</span>
        ) : null}
      </div>

      {results ? <Results results={results} copiedKey={copiedKey} onCopy={copySuggestion} /> : null}
    </div>
  );
}

function PageCard({
  index,
  page,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  page: PageEntry;
  canRemove: boolean;
  onChange: (patch: Partial<PageEntry>) => void;
  onRemove: () => void;
}) {
  const words = wordCount(page.content);
  const short = page.content.trim().length > 0 && words < MIN_CONTENT_WORDS;

  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Page {index + 1}</p>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove page ${index + 1}`}
            className="text-xs font-medium text-neutral-500 transition-colors hover:text-red-400"
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <input
          type="url"
          inputMode="url"
          placeholder="https://yoursite.com/some-page (optional)"
          value={page.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="Page title"
          value={page.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className={inputClass}
        />
      </div>
      <textarea
        placeholder="Paste the page's body text here (the more of the actual article, the better the match)"
        value={page.content}
        onChange={(e) => onChange({ content: e.target.value })}
        rows={6}
        className={`${inputClass} mt-2.5 resize-y`}
      />
      {short ? (
        <p className="mt-1.5 text-xs text-amber-300">
          Only {words} word{words === 1 ? "" : "s"} pasted - paste more of the page for a reliable match.
        </p>
      ) : null}
    </div>
  );
}

function strengthLabel(score: number): { label: string; cls: string } {
  if (score >= 0.5) return { label: "Strong match", cls: "bg-emerald-500/10 text-emerald-400" };
  return { label: "Possible match", cls: "bg-neutral-800 text-neutral-400" };
}

function Results({
  results,
  copiedKey,
  onCopy,
}: {
  results: LinkSuggestion[];
  copiedKey: string | null;
  onCopy: (s: LinkSuggestion) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
        No strong topical overlap found between these pages. Try pasting more of each page&apos;s body text
        (not just the intro), or compare pages that are more likely to actually relate to each other.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {results.length} suggestion{results.length === 1 ? "" : "s"}
      </p>
      {results.map((s) => {
        const key = `${s.fromId}-${s.toId}`;
        const strength = strengthLabel(s.score);
        return (
          <div key={key} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-neutral-100">
                {s.fromTitle || s.fromUrl}
                <span className="mx-2 text-neutral-600" aria-hidden="true">
                  →
                </span>
                {s.toTitle || s.toUrl}
              </p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${strength.cls}`}>
                {strength.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-400">
              Link the phrase{" "}
              <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200">
                {s.anchor}
              </code>{" "}
              on {s.fromTitle || s.fromUrl} to {s.toTitle || s.toUrl} - &quot;{s.term}&quot; is one of that
              page&apos;s main topics.
            </p>
            {s.reciprocal ? (
              <p className="mt-2 text-xs text-amber-300">
                Both pages match each other here - consider linking just one direction. Reciprocal links
                between the same two pages can look over-optimized.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onCopy(s)}
              className="mt-3 rounded-md border border-neutral-700/80 bg-neutral-800/90 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:text-white"
            >
              {copiedKey === key ? "Copied ✓" : "Copy markdown link"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
