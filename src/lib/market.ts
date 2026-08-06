// The markets a project can point its Google searches at - rank checks
// (daily-ranks, check_serp) and keyword research (keyword_ideas,
// suggest_keywords) all query the project's location_code + language_code.
// Client-safe on purpose (the Settings selector renders from it); the DB
// write lives in market-store.ts, same split as content-prefs.
//
// Kept deliberately in sync with serp.ts's LOCATION_TO_GL map: add a market
// here, add its SerpApi gl code there, or SerpApi-mode projects silently
// check ranks in the wrong country. Languages per market are the ones Google
// actually serves there; the first is the default the picker lands on.
export type Market = {
  location_code: number; // DataForSEO location code
  label: string;
  languages: { code: string; label: string }[];
};

export const MARKETS: Market[] = [
  {
    location_code: 2840,
    label: "United States",
    languages: [
      { code: "en", label: "English" },
      { code: "es", label: "Spanish" },
    ],
  },
  {
    location_code: 2826,
    label: "United Kingdom",
    languages: [{ code: "en", label: "English" }],
  },
  {
    location_code: 2124,
    label: "Canada",
    languages: [
      { code: "en", label: "English" },
      { code: "fr", label: "French" },
    ],
  },
  {
    location_code: 2036,
    label: "Australia",
    languages: [{ code: "en", label: "English" }],
  },
  {
    location_code: 2276,
    label: "Germany",
    languages: [
      { code: "de", label: "German" },
      { code: "en", label: "English" },
    ],
  },
  {
    location_code: 2250,
    label: "France",
    languages: [
      { code: "fr", label: "French" },
      { code: "en", label: "English" },
    ],
  },
  {
    location_code: 2724,
    label: "Spain",
    languages: [
      { code: "es", label: "Spanish" },
      { code: "en", label: "English" },
    ],
  },
  {
    location_code: 2380,
    label: "Italy",
    languages: [
      { code: "it", label: "Italian" },
      { code: "en", label: "English" },
    ],
  },
  {
    location_code: 2528,
    label: "Netherlands",
    languages: [
      { code: "nl", label: "Dutch" },
      { code: "en", label: "English" },
    ],
  },
  {
    location_code: 2376,
    label: "Israel",
    languages: [
      { code: "he", label: "Hebrew" },
      { code: "en", label: "English" },
    ],
  },
  {
    location_code: 2356,
    label: "India",
    languages: [
      { code: "en", label: "English" },
      { code: "hi", label: "Hindi" },
    ],
  },
  {
    location_code: 2076,
    label: "Brazil",
    languages: [
      { code: "pt", label: "Portuguese" },
      { code: "en", label: "English" },
    ],
  },
  {
    location_code: 2616,
    label: "Poland",
    languages: [
      { code: "pl", label: "Polish" },
      { code: "en", label: "English" },
    ],
  },
  {
    location_code: 2752,
    label: "Sweden",
    languages: [
      { code: "sv", label: "Swedish" },
      { code: "en", label: "English" },
    ],
  },
];

export function marketFor(locationCode: number): Market | null {
  return MARKETS.find((m) => m.location_code === locationCode) ?? null;
}

// Human-readable "Israel · Hebrew" for the Settings row and get_project-ish
// surfaces. Unknown codes (a hand-edited DB row) render as the raw values
// rather than lying.
export function marketLabel(locationCode: number, languageCode: string): string {
  const market = marketFor(locationCode);
  const language = market?.languages.find((l) => l.code === languageCode);
  return `${market?.label ?? `location ${locationCode}`} · ${language?.label ?? languageCode}`;
}

// Shared by the server action and the MCP tool, BEFORE the DB write. Returns
// an error message or null, so both callers surface the same wording.
export function validateMarket(locationCode: number, languageCode: string): string | null {
  const market = marketFor(locationCode);
  if (!market) {
    return (
      `Unknown location_code ${locationCode}. Supported markets: ` +
      MARKETS.map((m) => `${m.location_code} (${m.label})`).join(", ") +
      "."
    );
  }
  if (!market.languages.some((l) => l.code === languageCode)) {
    return (
      `${market.label} supports ${market.languages.map((l) => `'${l.code}' (${l.label})`).join(", ")} - ` +
      `got '${languageCode}'.`
    );
  }
  return null;
}
