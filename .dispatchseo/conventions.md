# DispatchSEO site facts

The reference card every SEO workflow reads before acting. Written by the
setup workflow (2026-07-16, instructions v2026-07-16.4); re-run `/seo-setup`
after stack or positioning changes. Dogfood note: this site IS a DispatchSEO
backend deployment - the product manages its own marketing site.

## Product

DispatchSEO - a self-hosted SEO manager the owner's coding agent (Claude Code
or Codex) drives over
MCP: agents research keywords, queue content ideas, build guides/tools as
PRs; the backend tracks ranks (DataForSEO) + Google Search Console daily and
serves a password-gated dashboard for approvals. One deployment manages many
sites (multi-tenant by MCP bearer token). A paid cloud version is planned;
the launch plan lives in the maintainer's untracked `docs-private/`.

**The problem it sells the fix to:** a founder or small team knows SEO
compounds and never gets to it - keyword research, a post a week, watching
ranks and Search Console. DispatchSEO is the answer to "who does my SEO",
not to "how do I build an agent pipeline". The subject of this site's
content is SEO work: keyword research, content operations, rank tracking,
Search Console, technical and programmatic SEO, and automating any of it.
Coding agents, MCP, Vercel and the rest are how the product is BUILT and what
its readers happen to run - they are not the subject. (See the quality
bar's product-is-the-answer test; this paragraph is what it reads.)

**Facets** - the honest descriptions of this product's job, most direct first.
The research run measures these against the site's current authority every week
and works whichever is winnable (research step 1.5). "SEO" is the most obvious
one and the most saturated: Ahrefs and Semrush have published into it since
2011, so at DR 0 everything both relevant and winnable there is a long-tail.
The agent facets are much younger markets and equally true of the product.
1. **SEO automation** - doing the SEO work itself, not advising on it
2. **Agents that do real work unattended** - an agent that ships, on a
   schedule, without a human in the loop (NOT "agents" in general, and NOT
   coding-agent tooling - see the remit test)
3. **Content pipelines** - research to published page as one automated flow
4. **Rank tracking + Search Console** - the measurement half, self-hosted
5. **Marketing that lives in a dev workflow** - PRs, CI, a repo, no CMS

Product-surface files to read fresh each research run.

Positioning - what the site is ABOUT; the topic remit comes from here:
- `src/app/page.tsx` (+ `feature-showcase.tsx`, `landing-nav.tsx`) - the
  landing page: the promise, the objections, the buyer
- `README.md` - the repo's landing page, same positioning in long form
- `src/app/docs/**` - the public docs site, product-wide
- `docs/SPEC.md` - the original spec (launch plan: `docs-private/LAUNCH_PLAN.md`,
  maintainer machine only)

Capability - what it does, feature by feature:
- `CLAUDE.md` - architecture + product ethos (repo root)
- `src/lib/instructions/*.ts` - the agent playbooks (what the product actually does)
- `src/app/(dashboard)/page.tsx` and siblings - the dashboard surface

## Stack & build

- Next.js 16 App Router + React 19 + Tailwind CSS v4 (`@tailwindcss/postcss`,
  no config file) + TypeScript. Supabase (server-only). Path alias `@/*` -> `src/*`.
- Package manager: **pnpm**. Build/verify: **`pnpm build`** (runs tsc; no
  separate lint/test). Confirmed to pass with zero env - every dashboard
  route is force-dynamic, and /blog is filesystem-only.
- CI gates on PRs: Vercel preview deploy; the seo-auto-merge workflow's
  green-checks gate.

## Guides

- Files: `src/content/blog/<slug>.mdx` - slug is the kebab-case filename.
- Frontmatter contract: `title` (string), `description` (string, meta
  description length), `date` (YYYY-MM-DD), optional `keyword` (the primary
  keyword targeted), optional `cover` (absolute-from-root image path, e.g.
  `/blog/covers/<slug>.webp` - generated via `scripts/generate-cover.mjs`,
  see the playbook's COVER IMAGE step). Nothing else is read.
- Rendering: `next-mdx-remote/rsc` with the component map in
  `src/components/blog/registry.tsx` (`src/app/blog/[slug]/page.tsx` is the
  template). The platform renders automatically: canonical URL, OG
  (type article), the `/blog` index entry, and `src/app/sitemap.ts`
  coverage. No RSS, no JSON-LD, no OG images yet.
- Bespoke visuals: one component file per guide in `src/components/blog/`,
  registered in `registry.tsx`, referenced by name in the MDX.
- Internal links: standard markdown `[text](/blog/other-slug)`.
- Exemplars: none yet - this scaffold is new. The first merged guides
  become the exemplars; until then match the dashboard's plain, concrete
  tone (see Voice).

## Tools

- Public base path: **`/free-tools/<slug>`**. `/tools` is taken - it is the
  password-gated dashboard screen in the `(dashboard)` route group, NOT a
  public surface, and it must not be moved or reused.
- **No tools home exists yet.** The first tool build scaffolds it in its own
  PR (build-tool step 3): a registry module, `/free-tools` index page,
  `/free-tools/[slug]` detail template rendering the locked funnel (large
  centered title -> value line -> widget -> CTA -> description -> FAQ),
  sitemap coverage in `src/app/sitemap.ts`, and the widget components under
  `src/components/free-tools/`. Nothing here is auth-gated - the site has no
  middleware; dashboard pages guard themselves individually, so a new public
  route is public by default. Verify anyway with a cookie-less request.
- Reference implementation: none yet - the first merged tool becomes it.
  Update this section (base path, registry path, wiring steps, reference)
  in that same PR.
- Tool ideas ARE queued every week regardless of the above; see the research
  workflow's tool slot.

## Design system

- Dark-only (`color-scheme: dark`). Body: `bg-neutral-950 text-neutral-100`,
  base font-weight 450 (`src/app/globals.css`).
- Fonts (root layout): Hanken Grotesk = `--font-hanken` (sans), Geist Mono =
  `--font-geist-mono`. Mapped to Tailwind tokens in globals' `@theme inline`.
- Idioms: cards `rounded-xl bg-neutral-900 p-4 sm:p-5`; primary buttons
  `bg-violet-500 text-neutral-950 rounded-lg`; links `text-violet-400
  hover:text-violet-300` (dashboard uses sky-400 for inline how-to links);
  success `text-emerald-400`; warnings `text-amber-300`; muted labels
  `text-xs uppercase tracking-wide text-neutral-500`.
- Icons: inline SVG strokes (strokeWidth 1.7-2.2), no icon library.
- Logomark: `src/components/logo.tsx` (DispatchMark).
- Exemplar visual components: `src/components/ui.tsx`,
  `src/components/journey-card.tsx`, `src/components/glance-stats.tsx`.

## Voice & writing rules

- Plain, concrete, no hype ("revolutionary", "game-changing" are banned).
- Spaced hyphen " - " for asides, never em dashes.
- Speak to the owner as "you"; the product is "DispatchSEO" or "the
  manager"; the user's agent is "your agent" or "your coding agent". Never
  imply the product is Claude-Code-only - Claude Code and Codex are both
  first-class, so name both or say "your coding agent".
- Sentence case for titles and headings.
- The owner's machines carry a `humanizer` skill (`~/.claude/skills/humanizer/`)
  - run drafts through it when available.

## Analytics

`@vercel/analytics` in the root layout - page views only, no custom event
convention. PostHog exists org-side but is not wired into this app.
