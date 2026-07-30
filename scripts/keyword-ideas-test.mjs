// Smoke-test for the keyword_ideas MCP tool, after the 2026-07-30 rewrite:
// the old Labs keyword_ideas/live endpoint is CATEGORY-based (DataForSEO's
// own docs say results are "not necessarily semantically similar") and
// language_code never filtered the output language, so English SEO seeds
// came back with things like "audemars piguet marketing" and French/Italian
// keywords mixed in. This script calls the real (deployed or local) MCP tool
// with English SEO seeds and FAILS if anything it returns has no search
// volume or reads as non-English - the two failure modes of the old bug.
//
// The tool's response shape is deliberately unchanged ({ideas:[{keyword,
// volume, kd, cpc}]}) - instructions and connected repos depend on it - so
// this test can't read DataForSEO's detected_language field back out of the
// response; it uses its own independent "looks non-English" heuristic
// (non-ASCII characters) as a cheap, honest check that doesn't just trust
// the server-side filtering it's supposed to be verifying.
//
// Run:
//   node --env-file=.env.local scripts/keyword-ideas-test.mjs [base-url]
// base-url defaults to http://localhost:3000 (needs `pnpm dev` running);
// pass https://dispatchseo.com to smoke-test production. Costs real metered
// DataForSEO calls (up to 5 seeds x 2 calls each = 10) - don't loop this.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:3000";
const token = process.env.MCP_API_KEY;
if (!token) {
  console.error("Missing MCP_API_KEY in .env.local");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "keyword-ideas-smoke-test", version: "1.0.0" });
await client.connect(transport);

let ok = true;
function check(label, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!cond) ok = false;
}

// English SEO seeds, best-signal-first (the tool only expands the first 5).
const seeds = [
  "ai seo",
  "seo automation",
  "ai seo agent",
  "seo mcp server",
  "programmatic seo",
  "automated seo tool", // beyond the cap of 5 - should come back "skipped"
];

// 1. The tool is registered.
const { tools } = await client.listTools();
const tool = tools.find((t) => t.name === "keyword_ideas");
check("keyword_ideas listed", Boolean(tool), `${tools.length} tools total`);

// 2. Call it for real.
const res = await client.callTool({
  name: "keyword_ideas",
  arguments: { seeds, limit: 100 },
});
check("call did not error", res.isError !== true, res.isError ? JSON.stringify(res.content) : "");

const payload = JSON.parse(res.content[0].text);
console.log(`\nNote: ${payload.note ?? "(none)"}\n`);

check("returns seeds echoed back", Array.isArray(payload.seeds));
check("returns an ideas array", Array.isArray(payload.ideas));
check("returns a note", typeof payload.note === "string" && payload.note.length > 0);
check(
  "note names the seed cap",
  /skipped/i.test(payload.note ?? "") || seeds.length <= 5,
  payload.note,
);

// 3. No fabricated / partial data disguised as success: if DataForSEO has no
//    access for this project, ideas must be empty AND the note must say so -
//    never a non-empty list alongside a "no access" claim.
if ((payload.note ?? "").includes("No DataForSEO access")) {
  check("empty ideas when no DataForSEO access", payload.ideas.length === 0);
  console.log("\nProject has no DataForSEO access configured - skipping the content checks below.");
} else {
  check("ideas list is non-empty", payload.ideas.length > 0, `${payload.ideas.length} ideas`);

  // 4. Every idea must have real volume - the old bug's first failure mode
  //    was null/zero-volume noise from a category-neighbor endpoint.
  const noVolume = payload.ideas.filter((i) => !i.volume || i.volume <= 0);
  check("no idea has null/zero volume", noVolume.length === 0, `${noVolume.length} bad: ${noVolume.map((i) => i.keyword).join(", ")}`);

  // 5. Every idea must look English - the old bug's second failure mode was
  //    language_code not filtering output language at all. Non-ASCII letters
  //    catch accented French/Italian/Spanish and non-Latin scripts alike;
  //    it's a heuristic, not a real language detector, but it's independent
  //    of whatever the tool itself trusts internally.
  const nonAscii = /[^\x00-\x7F]/;
  const looksNonEnglish = payload.ideas.filter((i) => nonAscii.test(i.keyword));
  check(
    "no idea looks non-English (non-ASCII characters)",
    looksNonEnglish.length === 0,
    `${looksNonEnglish.length} bad: ${looksNonEnglish.map((i) => i.keyword).join(", ")}`,
  );

  // 6. Sanity: results should actually relate to the seed topic, not drift
  //    into an unrelated category the way the old endpoint did. Cheap check -
  //    at least some ideas share a token with at least one seed.
  const seedTokens = new Set(
    seeds.slice(0, 5).flatMap((s) => s.toLowerCase().split(/\s+/)),
  );
  const related = payload.ideas.filter((i) =>
    i.keyword.toLowerCase().split(/\s+/).some((tok) => seedTokens.has(tok)),
  );
  check(
    "at least some ideas share a word with a seed",
    related.length > 0,
    `${related.length} of ${payload.ideas.length}`,
  );

  console.log("\nTop 10 ideas by volume:");
  for (const i of payload.ideas.slice(0, 10)) {
    console.log(`  ${i.keyword} — vol=${i.volume} kd=${i.kd} cpc=${i.cpc}`);
  }
}

await client.close();
console.log(ok ? "\nAll checks passed." : "\nFAILED.");
process.exit(ok ? 0 : 1);
