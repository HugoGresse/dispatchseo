// Pure, client-safe text analysis behind the Internal Linking Tool widget.
// No network calls, no DOM - just tokenizing pasted page text and scoring
// which pages should link to which. Kept isolated from the widget component
// so the scoring logic can be reasoned about (and hand-tested) on its own.

export type LinkPage = {
  id: string;
  url: string;
  title: string;
  content: string;
};

export type LinkSuggestion = {
  fromId: string;
  fromUrl: string;
  fromTitle: string;
  toId: string;
  toUrl: string;
  toTitle: string;
  anchor: string;
  term: string;
  /** 0-1: how central `term` is to the target page's own content. */
  score: number;
  reciprocal: boolean;
};

const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before being " +
    "below between both but by can cannot could did do does doing down during each few for from " +
    "further had has have having he her here hers herself him himself his how i if in into is it " +
    "its itself let me more most my myself no nor not of off on once only or other ought our ours " +
    "ourselves out over own same she should so some such than that the their theirs them themselves " +
    "then there these they this those through to too under until up very was we were what when " +
    "where which while who whom why with would you your yours yourself yourselves also just like " +
    "get gets one two three new use used using make made way ways really lot lots much many going go onto"
  ).split(" "),
);

const TITLE_BOOST = 3;
const TOP_TERMS_PER_PAGE = 20;
const MIN_SCORE = 0.15;
const MAX_SUGGESTIONS_PER_SOURCE = 5;
export const MIN_CONTENT_WORDS = 40;
const MAX_CONTENT_CHARS = 20000;

function rawTokens(text: string): string[] {
  return text
    .slice(0, MAX_CONTENT_CHARS)
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isContentWord(token: string): boolean {
  return token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token);
}

// Term frequency over unigrams and bigrams, bigrams built from the ORIGINAL
// token sequence (not the stopword-filtered one) so "internal linking"
// survives as a phrase instead of colliding with unrelated adjacent words
// once stopwords are dropped. Any term that also appears in the page's own
// title is boosted - title words are the strongest signal of what a page is
// actually about.
function weightedTerms(content: string, title: string): Map<string, number> {
  const tokens = rawTokens(content);
  const freq = new Map<string, number>();

  for (const t of tokens) {
    if (!isContentWord(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (isContentWord(a) && isContentWord(b)) {
      const bigram = `${a} ${b}`;
      freq.set(bigram, (freq.get(bigram) ?? 0) + 1.5);
    }
  }

  if (title.trim()) {
    const titleWords = new Set(rawTokens(title).filter(isContentWord));
    for (const [term, weight] of freq) {
      if (term.split(" ").every((part) => titleWords.has(part))) {
        freq.set(term, weight * TITLE_BOOST);
      }
    }
  }

  return freq;
}

function topTerms(freq: Map<string, number>, n: number): [string, number][] {
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Finds `term` as a whole-word, case-insensitive substring of `text` and
// returns it in the casing it actually appears in - the anchor text a
// suggestion offers is always a literal quote from the source page, never
// invented.
function findVerbatim(term: string, text: string): string | null {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`\\b${escaped}\\b`, "i"));
  return match ? match[0] : null;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// For every ordered pair (source, target), find the target's most important
// keyword/phrase that literally appears in the source's pasted text, and
// score it by how central that term is to the target (relative to the
// target's own #1 term). This asks "does the source page already mention
// something the target page is substantively about" rather than "are these
// two pages generically similar" - the question that actually matters for
// deciding which page should link to which.
export function analyzeInternalLinks(pages: LinkPage[]): LinkSuggestion[] {
  const withTerms = pages.map((p) => ({
    page: p,
    top: topTerms(weightedTerms(p.content, p.title), TOP_TERMS_PER_PAGE),
  }));

  const candidates: LinkSuggestion[] = [];

  for (const target of withTerms) {
    const topWeight = target.top[0]?.[1] ?? 0;
    if (topWeight <= 0) continue;

    for (const source of withTerms) {
      if (source.page.id === target.page.id) continue;

      let best: { term: string; anchor: string; score: number } | null = null;
      for (const [term, weight] of target.top) {
        const anchor = findVerbatim(term, source.page.content);
        if (!anchor) continue;
        const score = weight / topWeight;
        const isBigram = term.includes(" ");
        if (!best || score > best.score || (score === best.score && isBigram && !best.term.includes(" "))) {
          best = { term, anchor, score };
        }
      }
      if (!best || best.score < MIN_SCORE) continue;

      candidates.push({
        fromId: source.page.id,
        fromUrl: source.page.url,
        fromTitle: source.page.title,
        toId: target.page.id,
        toUrl: target.page.url,
        toTitle: target.page.title,
        anchor: best.anchor,
        term: best.term,
        score: best.score,
        reciprocal: false,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const perSource = new Map<string, number>();
  const kept: LinkSuggestion[] = [];
  for (const c of candidates) {
    const count = perSource.get(c.fromId) ?? 0;
    if (count >= MAX_SUGGESTIONS_PER_SOURCE) continue;
    perSource.set(c.fromId, count + 1);
    kept.push(c);
  }

  const pairKey = (a: string, b: string) => [a, b].sort().join("::");
  const pairs = new Map<string, number>();
  for (const c of kept) pairs.set(pairKey(c.fromId, c.toId), (pairs.get(pairKey(c.fromId, c.toId)) ?? 0) + 1);
  for (const c of kept) c.reciprocal = (pairs.get(pairKey(c.fromId, c.toId)) ?? 0) > 1;

  return kept;
}
