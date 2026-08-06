"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMarket } from "@/app/actions";
import { MARKETS, marketFor } from "@/lib/market";

// The search-market row on Settings. Every project starts at US/English,
// which quietly measures the wrong Google for any site whose audience
// searches from another country or in another language - this row is where
// the owner points rank checks and keyword research at the real market.
export function MarketRow({
  locationCode,
  languageCode,
  slug,
}: {
  locationCode: number;
  languageCode: string;
  slug: string;
}) {
  const [location, setLocation] = useState(locationCode);
  const [language, setLanguage] = useState(languageCode);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // A hand-edited DB row can hold a market this list doesn't know; fall back
  // to the full list so the selector still renders and can save a valid pair.
  const market = marketFor(location) ?? MARKETS[0];
  const languages = market.languages;
  const dirty = location !== locationCode || language !== languageCode;

  function pickLocation(code: number) {
    setLocation(code);
    const next = marketFor(code);
    // Keep the language when the new market supports it, else its default.
    if (next && !next.languages.some((l) => l.code === language)) {
      setLanguage(next.languages[0].code);
    }
  }

  function save() {
    if (!dirty || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await setMarket(location, language, slug);
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
        title="Which Google country and language rank checks and keyword research query"
      >
        Search market
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <select
          value={location}
          onChange={(e) => pickLocation(Number(e.target.value))}
          className="rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-200 [color-scheme:dark]"
        >
          {MARKETS.map((m) => (
            <option key={m.location_code} value={m.location_code}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-200 [color-scheme:dark]"
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
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
        {error ? <span className="text-xs text-red-400">{error}</span> : null}
      </span>
    </div>
  );
}
