import { getAllDocs } from "@/lib/docs";

// Every documentation page, inline, in sidebar order. One fetch and an agent
// has the complete docs - no crawling, no guessing which page holds the
// answer. Companion to /llms.txt, which is the map rather than the territory.

export const dynamic = "force-static";

const BASE = "https://dispatchseo.com";

export function GET() {
  const docs = getAllDocs();

  const pages = docs
    .map(({ section, meta, content }) =>
      [
        `<!-- ${section} -->`,
        `# ${meta.title}`,
        meta.description ? `\n> ${meta.description}` : "",
        `\nSource: ${BASE}/docs/${meta.slug}\n`,
        content.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");

  const body = `# DispatchSEO - complete documentation

Every page of https://dispatchseo.com/docs, concatenated in reading order.
Generated from source, so it always matches the live site.

For a shorter index with one-line page descriptions, see ${BASE}/llms.txt
Repository: https://github.com/NeoZi12/dispatchseo (AGPL-3.0)

Pages in this file, in order:
${docs.map((d, i) => `${i + 1}. ${d.meta.title} (${d.section})`).join("\n")}

---

${pages}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
