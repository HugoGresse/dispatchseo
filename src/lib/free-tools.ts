import type { ComponentType } from "react";
import { InternalLinkingTool } from "@/components/free-tools/internal-linking-tool";

// Registry for the free, public interactive tools at /free-tools/<slug>.
// One entry per tool - everything the index card and the detail page's
// locked funnel (title -> value line -> widget -> CTA -> description -> FAQ)
// need to render. Add a tool by adding an entry here and a widget component
// under src/components/free-tools/; nothing else has to change.

export type ToolFaqItem = {
  question: string;
  answer: string;
};

export type ToolEntry = {
  slug: string;
  /** <title> tag and index-page card heading. */
  title: string;
  /** Large centered hero heading on the detail page - usually == title. */
  h1: string;
  /** One line under the h1 stating what the user walks away with. */
  valueLine: string;
  metaDescription: string;
  /** Description copy below the widget, one paragraph per entry. */
  description: string[];
  faq: ToolFaqItem[];
  Widget: ComponentType;
};

export const FREE_TOOLS: ToolEntry[] = [
  {
    slug: "internal-linking-tool",
    title: "Internal linking tool",
    h1: "Internal linking tool",
    valueLine:
      "Paste in a few pages and get back concrete internal-link suggestions - which page should link to which, and the exact anchor text to use, pulled straight from your own words.",
    metaDescription:
      "Free internal linking tool: paste in your pages and get link suggestions with ready-to-use anchor text, computed entirely in your browser. No signup, no crawling.",
    description: [
      "Paste in the title and body text of two or more pages from your site and this tool looks for real topical overlap between them: shared phrases that are a big part of what one page is about and that already show up, word for word, somewhere in the other page's text. When it finds one, it tells you which page should link to which and hands you the exact anchor text to use - never a made-up phrase, always something pulled straight from what you pasted.",
      "It weighs two-word phrases over single keywords (\"internal linking\" beats \"linking\" on its own) and gives extra weight to anything that also shows up in a page's title, since that's usually the strongest signal of what a page is actually about. Paste your homepage and a blog post that happens to reference the same feature, for example, and it will surface that exact sentence as the link opportunity rather than a generic \"these seem related\" guess.",
      "Nothing you paste is uploaded anywhere - the whole analysis runs in your browser tab. That also means it works on any site, in any CMS, not just ones a crawler can reach.",
      "This is the same kind of linking decision DispatchSEO's own pipeline makes automatically for every guide it publishes - see how that fits into a fully " +
        "[automated SEO agent](/blog/ai-seo-agent) if you'd rather not paste pages in by hand every time your site grows.",
    ],
    faq: [
      {
        question: "How does it decide which pages should link to which?",
        answer:
          "It tokenizes the text you paste into single words and two-word phrases, drops common filler words, and boosts anything that also appears in a page's title. Then for each pair of pages it checks whether one page's most important phrase literally appears in the other page's text. If it does, that's the suggestion - the anchor text is always a verbatim quote from your own paste, never invented.",
      },
      {
        question: "Do I need to give it my website URL?",
        answer:
          "No. You paste in page content directly instead of pointing it at a URL. That's deliberate: a tool running in your browser can't reliably fetch other websites' pages (browsers block that for almost any site that isn't the one you're on), so pasting is what actually works reliably, on any site, without needing account access to anything.",
      },
      {
        question: "Why didn't it suggest anything for some of my pages?",
        answer:
          "It only surfaces a suggestion when there's a real, meaningful phrase shared between two pages - not a coincidental single word. If two pages genuinely don't overlap, or you've only pasted a short excerpt, it says so honestly instead of forcing a weak match.",
      },
      {
        question: "Is this the same linking logic DispatchSEO uses for its own content?",
        answer:
          "It's a taste of it. DispatchSEO's pipeline wires new guides into your existing content automatically, on every build, as part of running your SEO end to end - this free tool does the same kind of matching by hand, one paste at a time.",
      },
      {
        question: "How many pages can I paste in at once?",
        answer:
          "There's no hard limit, but results stay easiest to act on with somewhere around 5-15 pages at a time. Each page caps out at 5 outgoing suggestions so the results don't push you toward over-linking.",
      },
      {
        question: "Does it work for sites that aren't on WordPress?",
        answer:
          "Yes - since you paste content in rather than pointing it at a crawler, it works the same way regardless of what the site is built on.",
      },
    ],
    Widget: InternalLinkingTool,
  },
];

export function getAllTools(): ToolEntry[] {
  return FREE_TOOLS;
}

export function getTool(slug: string): ToolEntry | null {
  return FREE_TOOLS.find((t) => t.slug === slug) ?? null;
}
