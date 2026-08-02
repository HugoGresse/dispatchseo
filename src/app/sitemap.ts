import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { getDocSlugs } from "@/lib/docs";
import { getAllTools } from "@/lib/free-tools";
import { LATEST } from "@/lib/changelog";

// Only the public surface belongs here - the dashboard is password-gated
// and should never be crawled.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://dispatchseo.com";
  return [
    // The landing page - the commercial entry point, and the one page a
    // sitemap that omits it looks broken for. Bare origin, no trailing slash,
    // to match byte-for-byte what page.tsx emits as its canonical.
    { url: base, changeFrequency: "weekly", priority: 1 },
    // The agent-specific hubs - same commercial intent as the flagship page,
    // just keyword-first for "dispatchseo claude code" / "dispatchseo codex".
    { url: `${base}/claude-code`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/codex`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/blog`, changeFrequency: "daily" },
    ...getAllPosts().map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.date),
    })),
    { url: `${base}/docs` },
    ...getDocSlugs().map((slug) => ({ url: `${base}/docs/${slug}` })),
    { url: `${base}/free-tools`, changeFrequency: "weekly" },
    ...getAllTools().map((tool) => ({ url: `${base}/free-tools/${tool.slug}` })),
    // Public release notes - linkable, and worth crawling as proof the
    // product is alive. lastModified is the newest release's own date.
    { url: `${base}/changelog`, lastModified: LATEST ? new Date(LATEST.date) : undefined },
  ];
}
