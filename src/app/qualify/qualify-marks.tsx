// Brand marks for the two-step qualifier. Client-safe: nothing server-only is
// imported here, ever - this file renders inside a "use client" form.
//
// WordPress and GitHub are the vendors' published marks, pasted UNMODIFIED
// (the Simple Icons renditions of the official W and the Invertocat). Both
// trademark policies allow this kind of referential "works with / connects to"
// use and both forbid altering the mark, so: currentColor only, no effects,
// never larger than our own branding. The agent marks reuse AgentMark, which
// carries the same notes for Anthropic, OpenAI and the deliberately generic
// Cursor pointer. "Built with code" has no vendor: it is a plain code glyph
// with the GitHub mark beside it, because the repo is the part we connect to.

import { AgentMark } from "@/components/agent-mark";
import type { AiChoice, SiteKind } from "@/lib/qualifier-options";

const WORDPRESS_PATH =
  "M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0";

const GITHUB_PATH =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

export function WordPressMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden focusable="false">
      <path d={WORDPRESS_PATH} />
    </svg>
  );
}

export function GitHubMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden focusable="false">
      <path d={GITHUB_PATH} />
    </svg>
  );
}

/** A code glyph: the generic "built with code" sign, no vendor implied. */
export function CodeMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="m8 7-5 5 5 5" />
      <path d="m16 7 5 5-5 5" />
      <path d="m13.5 4-3 16" />
    </svg>
  );
}

/** A terminal prompt, used as a small badge to tell the coding agent from the
 *  chat app that shares its vendor mark (Claude vs Claude Code, ChatGPT vs
 *  Codex). */
export function TerminalBadge({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="m5 7 5 5-5 5" />
      <path d="M13 17h6" />
    </svg>
  );
}

/** The mark for a site kind, sized for the big step-1 cards. */
export function SiteKindMark({ kind, className = "h-7 w-7" }: { kind: SiteKind; className?: string }) {
  if (kind === "wordpress") return <WordPressMark className={className} />;
  return (
    <span className="inline-flex items-center gap-1.5">
      <CodeMark className={className} />
      <GitHubMark className={className} />
    </span>
  );
}

/** The mark for an AI choice. Gemini and "none" have no mark on purpose: they
 *  live behind the "something else" link and are text, not tiles. */
export function AiMark({ ai, className = "h-6 w-6" }: { ai: AiChoice; className?: string }) {
  switch (ai) {
    case "claude-web":
      return <AgentMark id="claude" className={className} />;
    case "chatgpt":
      return <AgentMark id="codex" className={className} />;
    case "claude-code":
      return <Badged className={className} mark={<AgentMark id="claude" className={className} />} />;
    case "codex":
      return <Badged className={className} mark={<AgentMark id="codex" className={className} />} />;
    case "cursor":
      return <AgentMark id="cursor" className={className} />;
    default:
      return null;
  }
}

function Badged({ mark, className }: { mark: React.ReactNode; className: string }) {
  return (
    <span className={`relative inline-flex ${className}`}>
      {mark}
      <span className="absolute -bottom-1 -right-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-950 text-violet-300 ring-1 ring-neutral-800">
        <TerminalBadge className="h-2.5 w-2.5" />
      </span>
    </span>
  );
}
