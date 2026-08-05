import type { Metadata } from "next";
import Link from "next/link";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";

// Docs landing - the Quickstart. Its whole job is routing: three install
// paths, then the two setup steps every path converges on. Deliberately
// light on prose - the card grid IS the information architecture, same
// pattern Postiz's own quickstart uses.

export const metadata: Metadata = {
  title: "Docs - DispatchSEO",
  description: "Get DispatchSEO running, then hand it to your agent.",
  alternates: { canonical: "/docs" },
};

function ContainerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 7.5L12 12l8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 7.5h.01M7 16.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RepoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="18" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="6" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 8.3v7.4M18 8.3a6 6 0 0 1-6 6h-.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="15" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10.3 12.7L18 5M15.3 7.7l2 2M18 5l2.3 2.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="10" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9 3.5v2M12 3.5v2M15 3.5v2M9 18.5v2M12 18.5v2M15 18.5v2M3.5 9h2M3.5 12h2M3.5 15h2M18.5 9h2M18.5 12h2M18.5 15h2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const INLINE_CODE = "rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-200";
const INLINE_LINK =
  "text-violet-400 underline underline-offset-2 hover:text-violet-300 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70";

const INSTALL_PATHS = [
  {
    href: "/docs/docker-compose",
    icon: ContainerIcon,
    title: "Your own computer",
    description: "One command, no cloud accounts.",
  },
  {
    href: "/docs/vps",
    icon: ServerIcon,
    title: "A VPS or server",
    description: "One line installs everything, HTTPS included.",
    recommended: true,
  },
  {
    href: "/docs/local-development",
    icon: TerminalIcon,
    title: "From source",
    description: "For contributors, with pnpm.",
  },
];

const THEN_STEPS = [
  { href: "/docs/search-console", title: "Connect Search Console" },
  { href: "/docs/connect-your-site", title: "Connect your site" },
  { href: "/docs/day-to-day", title: "Learn the weekly rhythm" },
];

export default function DocsQuickstart() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Quickstart</h1>
      <p className="mt-3 max-w-lg text-neutral-400">
        Get DispatchSEO running, then hand it to your agent.
      </p>

      {/* Escape hatch for repo traffic: the quickstart assumes you already
          know what this is, and a lot of arrivals from GitHub don't. */}
      <p className="mt-4 text-sm text-neutral-500">
        New here?{" "}
        <Link href="/docs/introduction" className={INLINE_LINK}>
          Start with what DispatchSEO is
        </Link>{" "}
        - two minutes, and the rest of these pages will make more sense.
      </p>

      <p
        id="before-you-start"
        className="mt-12 mb-4 scroll-mt-24 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500"
      >
        Before you start
      </p>
      <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
        <li className="flex gap-3 bg-amber-500/[0.04] px-5 py-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <RepoIcon />
          </span>
          <span>
            <span className="block text-sm font-medium text-neutral-100">
              A website whose code lives in a GitHub repo
            </span>
            <span className="mt-1 block text-sm text-neutral-400">
              Articles arrive as pull requests you review, so the site has to be git-based.
              WordPress and other database-backed CMSes can&apos;t work this way.
            </span>
          </span>
        </li>
        <li className="flex gap-3 px-5 py-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
            <SparkleIcon />
          </span>
          <span>
            <span className="block text-sm font-medium text-neutral-100">
              A coding agent -{" "}
              <a
                href="https://claude.com/product/claude-code"
                target="_blank"
                rel="noreferrer"
                className={INLINE_LINK}
              >
                Claude Code
              </a>{" "}
              (on a Claude subscription),{" "}
              <a href="/docs/install-codex" className={INLINE_LINK}>
                Codex
              </a>{" "}
              (on an OpenAI key), or{" "}
              <a href="/docs/install-cursor" className={INLINE_LINK}>
                Cursor
              </a>{" "}
              (on a paid Cursor plan)
            </span>
            <span className="mt-1 block text-sm text-neutral-400">
              Your agent does the actual thinking. Claude Code and Cursor run on plans you
              already pay for; Codex is metered by OpenAI per run. DispatchSEO never bills you
              for any of them.
            </span>
          </span>
        </li>
        <li className="flex gap-3 px-5 py-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
            <KeyIcon />
          </span>
          <span>
            <span className="block text-sm font-medium text-neutral-100">
              The{" "}
              <a href="https://cli.github.com" target="_blank" rel="noreferrer" className={INLINE_LINK}>
                GitHub CLI
              </a>{" "}
              (<code className={INLINE_CODE}>gh</code>), signed in
            </span>
            <span className="mt-1 block text-sm text-neutral-400">
              Your agent opens every pull request through it. Check with{" "}
              <code className={INLINE_CODE}>gh auth status</code>.
            </span>
          </span>
        </li>
        <li className="flex gap-3 px-5 py-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
            <CpuIcon />
          </span>
          <span>
            <span className="block text-sm font-medium text-neutral-100">
              A machine that can run Docker
            </span>
            <span className="mt-1 block text-sm text-neutral-400">
              About 1 GB of RAM. A laptop is fine to try it; schedules only run while the machine
              is awake, so day to day you want something that stays on.
            </span>
          </span>
        </li>
      </ul>

      {/* Anchored: the README's single Install button deep-links here, so repo
          traffic lands on the three paths instead of the top of the page. */}
      <p
        id="choose-your-install"
        className="mt-12 mb-4 scroll-mt-24 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500"
      >
        Choose your install
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {INSTALL_PATHS.map(({ href, icon: Icon, title, description, recommended }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 outline-none transition-colors hover:border-neutral-700 hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            {recommended && (
              <span className="absolute top-5 right-5 rounded border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-violet-300">
                Highly recommended
              </span>
            )}
            <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Icon />
            </span>
            <span>
              <span className="block font-medium text-neutral-100">{title}</span>
              <span className="mt-1 block text-sm text-neutral-400">{description}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-12 mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        Then
      </p>
      <div className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
        {THEN_STEPS.map((step, i) => (
          <Link
            key={step.href}
            href={step.href}
            className="group flex items-center justify-between gap-3 px-5 py-3.5 outline-none transition-colors hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-inset"
          >
            <span className="flex items-center gap-3">
              <span className="font-mono text-sm text-neutral-600">{i + 1}</span>
              <span className="text-sm font-medium text-neutral-200">{step.title}</span>
            </span>
            <span
              aria-hidden="true"
              className="text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-400"
            >
              →
            </span>
          </Link>
        ))}
      </div>

      {/* Closing the quickstart with a person, not a dead end. This page is
          where repo traffic lands, so it's also where someone decides whether
          they'd be on their own if an install went sideways. */}
      <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4">
        <span className="text-sm text-neutral-400">Stuck on any of it?</span>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#7d87f5] outline-none transition-colors hover:text-[#98a0f8] focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        >
          <DiscordMark className="size-4 shrink-0" />
          Ask in the Discord
        </a>
      </div>
    </div>
  );
}
