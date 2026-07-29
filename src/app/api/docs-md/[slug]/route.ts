import { getDoc, getDocSlugs } from "@/lib/docs";

// Plain-markdown mirror of a single doc page. Reached as /docs/<slug>.md via
// the rewrite in next.config.ts - the ".md" convention agents and LLM tools
// already probe for (Mintlify sites, GitHub raw). Lives under /api so it
// cannot collide with the /docs/[slug] page route.
//
// Public by construction: /api/* is excluded from the password gate in
// src/proxy.ts, and docs are public anyway.

export const dynamic = "force-static";

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return new Response("Not found\n", { status: 404 });

  const body = `# ${doc.meta.title}\n${
    doc.meta.description ? `\n> ${doc.meta.description}\n` : ""
  }\nSource: https://dispatchseo.com/docs/${slug}\nAll docs in one file: https://dispatchseo.com/llms-full.txt\n\n${doc.content.trim()}\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
