import { getAllDocs } from "@/lib/docs";
import { getAllPosts } from "@/lib/blog";

// The agent-facing index (llmstxt.org). Generated, not hand-written: the page
// list comes from DOCS_NAV, so a new doc page appears here the moment it is
// added and can never silently drift out of date - the failure mode the old
// static public/llms.txt had.
//
// Two files, on purpose:
//   /llms.txt      - this one. A map: what the product is, plus every page
//                    with a one-line description, so an agent can pick.
//   /llms-full.txt - every page's full text inline, for "read everything".
//
// Both are public in src/proxy.ts and served as text/plain so a curl or a
// WebFetch gets prose, not an HTML shell.

export const dynamic = "force-static";

const BASE = "https://dispatchseo.com";

const SUMMARY = `# DispatchSEO

> Open-source SEO manager driven by the AI you already pay for: the ordinary
> Claude app at claude.ai, a coding agent (Claude Code, Codex, Cursor), or any
> other MCP client. Your AI already knows your product, so DispatchSEO gives
> it the missing half: keyword research it can act on, articles that ship as
> pull requests to your own repo or straight into self-hosted WordPress, rank
> tracking, and a human approval dashboard. Self-hosted with one Docker
> command, AGPL-3.0. A hosted version exists at dispatchseo.com, but
> self-hosting has zero feature limitations.

## What it is, in one paragraph

DispatchSEO is a backend, not a writer. It stores state (a suggestions queue,
keywords, published pages, rankings, Search Console stats, backlink
prospects), runs schedules (daily rank checks, hourly GSC snapshots, a nightly
content builder), and gates everything behind a human approval step. The
thinking - research, judgement, writing - happens in your own AI: the Claude
app at claude.ai, or a coding agent (Claude Code, Codex, Cursor), which talks
to DispatchSEO over MCP. That split is deliberate: your AI already has your
product knowledge, so it does not need to crawl your homepage to guess at it.

## Key facts

- The MCP server is at /api/mcp (streamable HTTP, bearer token per project).
  The bearer token IS the tenant selector - one deployment manages many sites.
- The MCP exposes state only: reads and writes against the queue, keywords,
  pages, rankings, GSC stats, prospects, plus a get_instructions tool that
  serves the agent playbook. Keyword research and content generation happen in
  the agent, not on the server.
- Anything the dashboard can do, the agent can do over MCP. Parity between the
  two is a hard rule in the codebase.
- Two ways to connect an AI. A coding agent (Claude Code, Codex, Cursor)
  connects over MCP from a terminal, or the ordinary Claude app at claude.ai
  is pointed at the same server as a custom connector on any paid Claude plan,
  writes on the owner's own subscription, and hands the finished article back.
  ChatGPT is not supported yet; the Gemini app cannot connect outside tools at
  all.
- Content reaches your site one of two ways. For a self-hosted WordPress site,
  articles are posted through its own API, with cover image, internal links and
  schema already in place. For a code-built site, they arrive as pull requests
  to your GitHub repo, opened by the coding agent or by DispatchSEO itself when
  the article came from the Claude app; human approval is the default and
  automatic merge is opt-in.
- So you need either a self-hosted WordPress site or a site whose source lives
  in a Git repo. Hosted site builders (Wix, Squarespace, Shopify, Webflow) have
  neither, and are not supported. A coding agent is not required for either
  one.
- Data tiers stack: Google Search Console only (free), + a free SerpApi key
  (live SERP checks), + DataForSEO (volume and difficulty, pay per call).
- You bring your own AI subscription or key. DispatchSEO never bills for AI
  usage.
`;

function line(url: string, title: string, description: string) {
  return description ? `- [${title}](${url}): ${description}` : `- [${title}](${url})`;
}

export function GET() {
  const docs = getAllDocs();

  // Group the doc links under the same section headings the sidebar uses, so
  // an agent reading this file infers the same reading order a human sees.
  const bySection = new Map<string, string[]>();
  for (const { section, meta } of docs) {
    const entry = line(`${BASE}/docs/${meta.slug}.md`, meta.title, meta.description);
    bySection.set(section, [...(bySection.get(section) ?? []), entry]);
  }

  const docSections = [...bySection.entries()]
    .map(([section, items]) => `## ${section}\n\n${items.join("\n")}`)
    .join("\n\n");

  const posts = getAllPosts()
    .slice(0, 15)
    .map((p) => line(`${BASE}/blog/${p.slug}`, p.title, p.description ?? ""))
    .join("\n");

  const body = `${SUMMARY}
## Read everything at once

- [Full documentation, single file](${BASE}/llms-full.txt): every page below,
  inline. Fetch this one URL if you want the complete docs in one request.

Every documentation page is also available as plain markdown by appending
".md" to its URL - e.g. ${BASE}/docs/troubleshooting.md

## Start here

- [Quickstart](${BASE}/docs): choose an install path, then two setup steps.

${docSections}

## Reference on GitHub

- [Repository](https://github.com/NeoZi12/dispatchseo): source, issues, discussions
- [Architecture and conventions](https://github.com/NeoZi12/dispatchseo/blob/main/CLAUDE.md): written for agents
- [Agent setup skill](https://github.com/NeoZi12/dispatchseo/blob/main/SKILL.md): how an agent connects a site
- [Changelog](${BASE}/changelog): what shipped, newest first
- [Contributing](https://github.com/NeoZi12/dispatchseo/blob/main/CONTRIBUTING.md)
- [Security policy](https://github.com/NeoZi12/dispatchseo/blob/main/SECURITY.md)

## Guides

${posts}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
