import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker builds trace a minimal server into .next/standalone (~10x smaller
  // image); Vercel ignores standalone, but gating on DOCKER_BUILD keeps local
  // `pnpm build` output identical to what `pnpm start` expects.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  // The dashboard cookie lives 30 days and SameSite=Lax does not stop the
  // page being framed - without these an attacker can iframe the logged-in
  // dashboard and clickjack Approve/Merge/Delete buttons.
  // Agent-facing markdown mirror: /docs/<slug>.md serves the raw MDX the page
  // renders from. The ".md" suffix is the convention LLM tooling probes for,
  // but a folder named "[slug].md" is not a legal App Router segment - hence a
  // rewrite onto a plain API route. The slug pattern matches getDoc's own
  // validation, so a crafted path can never reach the filesystem read.
  async rewrites() {
    return [{ source: "/docs/:slug([a-z0-9-]+).md", destination: "/api/docs-md/:slug" }];
  },
  // /discord is the one place the Discord invite code lives. Every surface that
  // points at the community - the landing hero, the footer, the README badge
  // and its three prose links - points HERE, so regenerating the invite is a
  // one-line edit in this file instead of a hunt through five hardcoded copies
  // and a redeploy of the README. Same pattern Postiz (discord.postiz.com) and
  // Immich (discord.immich.app) use, on a path rather than a subdomain because
  // we already own the app and a path costs no DNS.
  //
  // permanent: false is load-bearing. A 308 is cached by the browser forever,
  // so the day the invite code changes, everyone who ever clicked the old one
  // keeps being sent to a dead invite - which is exactly the failure this
  // indirection exists to prevent. 307 keeps the redirect ours to change.
  // (Postiz ships a 301 here; Immich ships a 307. Immich is right.)
  //
  // It also has to be a config-level redirect rather than a route: unknown
  // paths hit the dashboard auth gate and bounce to /login, and next.config
  // redirects resolve ahead of that.
  async redirects() {
    return [
      { source: "/discord", destination: "https://discord.gg/D7Eq3hKtKs", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
