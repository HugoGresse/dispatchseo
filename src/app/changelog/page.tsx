import Link from "next/link";
import type { Metadata } from "next";
import { DispatchMark } from "@/components/logo";
import { ChangelogList } from "@/components/changelog-list";
import { CHANGELOG, LATEST } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "What's new · DispatchSEO",
  description: "Every release of DispatchSEO, newest first - what shipped and what changed.",
  // Linked from the dashboard banner with a #version anchor per release; the
  // canonical keeps every one of those pointing at the single page.
  alternates: { canonical: "/changelog" },
};

// The update log. Content comes from src/lib/changelog.ts - the same list the
// dashboard banner announces and the get_changelog MCP tool serves - so a
// release is written once and shows up in all three.
//
// Deliberately OUTSIDE the (dashboard) group and outside the password gate
// (see the public list in proxy.ts): it's opened in a new tab from the banner
// and closed again, so it carries its own thin header rather than the
// dashboard chrome, and it describes the PRODUCT, never a tenant's data - so
// it's linkable, crawlable, and readable while signed out. Reading no cookies
// and no DB is what lets it prerender as a static page.

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-5 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-500"
          >
            <DispatchMark className="h-6 w-auto" />
            <span className="text-sm font-semibold tracking-tight text-neutral-200">
              DispatchSEO
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded text-xs text-neutral-500 transition-colors hover:text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-500"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-28 pt-14 sm:px-6 sm:pt-20">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What&apos;s new</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
          Everything that shipped in DispatchSEO itself. Open a release to see what changed.
        </p>

        <div className="mt-10 sm:mt-12">
          <ChangelogList entries={CHANGELOG} latestVersion={LATEST?.version ?? null} />
        </div>

        <p className="mt-12 border-t border-neutral-800/60 pt-6 text-xs text-neutral-600">
          Updates apply themselves - nothing here needs an action from you.
        </p>
      </main>
    </div>
  );
}
