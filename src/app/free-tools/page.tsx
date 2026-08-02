import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DispatchMark } from "@/components/logo";
import { getAllTools } from "@/lib/free-tools";

// Public free-tools index - the site's tools home. Same contract as /blog:
// no auth, no DB. Public on the CLOUD deployment only: it is the hosted
// product's funnel, so LANDING_ENABLED gates it exactly like / and the agent
// hubs (proxy allowlist + the redirect below).

export const metadata: Metadata = {
  title: "Free SEO tools - DispatchSEO",
  description: "Free, no-signup interactive SEO tools - built by the same pipeline that runs DispatchSEO's own SEO.",
  alternates: { canonical: "/free-tools" },
};

export default function FreeToolsIndex() {
  // Same guard as the agent hubs (agent-landing.tsx): this is the hosted
  // product's funnel, so a self-hosted install must not serve it from the
  // owner's own domain. Defense in depth behind the proxy allowlist.
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");
  const tools = getAllTools();

  return (
    <main className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
      <header className="mb-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-neutral-400 outline-none transition-colors hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        >
          <DispatchMark className="h-5 w-5" />
          DispatchSEO
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Free tools</h1>
        <p className="mt-2 max-w-lg text-neutral-400">
          Free, no-login SEO tools that run entirely in your browser - built by the same pipeline that runs
          DispatchSEO&apos;s own SEO.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link
            key={tool.slug}
            href={`/free-tools/${tool.slug}`}
            className="group rounded-xl bg-neutral-900 p-5 outline-none transition-colors hover:bg-neutral-800/80 focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            <h2 className="text-lg font-semibold tracking-tight text-neutral-100 group-hover:text-white">
              {tool.title}
            </h2>
            <p className="mt-2 text-sm text-neutral-400">{tool.valueLine}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-violet-400">
              Open tool
              <span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
