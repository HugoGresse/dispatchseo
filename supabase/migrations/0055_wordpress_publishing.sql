-- WordPress as a second publishing route, plus the two tables the new
-- article flow needs.
--
-- Until now there was exactly one way for an article to reach a customer's
-- site: open a pull request in their GitHub repo. That works for a code-built
-- site and is impossible to explain to someone whose site was built for them.
-- Two paid trials died at "Connect GitHub" in August 2026, one of them inside
-- five minutes. These columns are the other door.
--
-- Everything here is additive and defaulted, so in-flight code that knows
-- nothing about WordPress keeps writing valid rows: publish_target defaults to
-- 'github', which is exactly what every existing project is.

-- --- projects: where does this site's content go, and how do we get in ------

alter table projects
  add column if not exists publish_target text not null default 'github';

comment on column projects.publish_target is
  'github = open a PR in the repo (the original route). wordpress = post through the site''s own API. manual = we finish the article and hand it over, for an owner who has neither.';

-- The site's base address, kept separately from projects.domain: the WordPress
-- install can live somewhere the public domain does not (a subdirectory, or a
-- different host entirely behind a CDN), and guessing wrong means every write
-- lands nowhere.
alter table projects add column if not exists wp_url text;
alter table projects add column if not exists wp_username text;

-- Encrypted at rest with the same app-level AES-256-GCM used for the
-- DataForSEO password (src/lib/crypto.ts, "enc:v1:" prefix). Never written
-- plaintext, never logged, never returned by an MCP tool. A row written before
-- encryption existed would read back as legacy plaintext, but there are none:
-- this column is born encrypted.
alter table projects add column if not exists wp_app_password text;

alter table projects add column if not exists wp_connected_at timestamptz;

-- Which SEO plugin the site runs (yoast | rankmath | seopress | null), read
-- from the site's own API at connect time. It decides where a meta description
-- has to be written, so caching it here saves a probe on every single publish.
alter table projects add column if not exists wp_seo_plugin text;

-- What the connected WordPress user is actually allowed to do
-- (publish_posts / upload_files / edit_others_posts / edit_posts), captured at
-- connect time. Publishing checks this BEFORE writing rather than discovering
-- mid-flow that the owner connected a Subscriber - the failure then arrives as
-- a setup card with a fix, not as a half-published article.
alter table projects add column if not exists wp_capabilities jsonb;

-- The hour (0-23, site-local) a finished draft is flipped live. Our cron does
-- this, deliberately: WordPress's own scheduler only runs when someone loads a
-- page, so a scheduled post on a quiet site publishes late - WordPress's own
-- docs give a 2pm-scheduled/5pm-live example. Nullable = use the default.
alter table projects add column if not exists publish_hour smallint;

-- --- The site digest: what we know about a site, so their AI need not ------
--
-- Its own table rather than a projects column on purpose. Every projects query
-- selects the full column list, and this blob is a few KB - putting it on the
-- hot tenant-resolution path would tax every cron, every MCP call and every
-- page load to serve something read only when an article is being written.

create table if not exists site_digests (
  project_id uuid primary key default '00000000-0000-4000-8000-000000000001'
    references projects (id) on delete cascade,
  -- The compact summary a chat AI reads INSTEAD of crawling the site itself
  -- (src/lib/site-crawl.ts buildDigest). Budgeted to stay small enough to sit
  -- inside a $20 plan's context without crowding out the article.
  digest jsonb not null default '{}'::jsonb,
  -- Plain-English observations for the owner: pages we could not read, a cap
  -- we hit, a site that served us the same title for every address. Kept
  -- because a digest built from a quarter of a site must say so.
  notes jsonb not null default '[]'::jsonb,
  page_count integer not null default 0,
  -- wp-rest | sitemap | bfs - which door the crawl actually got in through.
  source text,
  crawled_at timestamptz not null default now()
);

alter table site_digests enable row level security;

-- --- Article drafts: the handoff point between their AI and ours -----------
--
-- The customer's own AI writes an article and submits it here. Our server
-- validates it (src/lib/article-validate.ts), finishes it (HTML, internal
-- links, schema, cover) and publishes it. This table is where an article lives
-- between "their AI said it is done" and "it is live on their site", which is
-- also the only place a human can look at it before it goes out.

create table if not exists article_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects (id) on delete cascade,
  -- The queued idea this fulfils. Nullable: an owner can ask their AI to write
  -- something that was never in the queue, and refusing that would make the
  -- queue a cage rather than a plan.
  suggestion_id uuid references suggestions (id) on delete set null,

  title text not null,
  slug text not null,
  meta_description text,
  primary_keyword text,
  markdown text not null,
  faq jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  cover_brief text,

  -- submitted -> rejected | accepted -> finished -> published (or discarded).
  -- rejected is not terminal: the AI reads the reasons and resubmits.
  status text not null default 'submitted',
  -- The full ValidationReport, including every check that failed and the
  -- exact instruction handed back. Kept so "why was my article rejected" is
  -- answerable weeks later, and so rejection rates per client are measurable.
  validation jsonb,

  rendered_html text,
  cover_url text,
  -- WordPress's own post id, so the publish step can flip the draft it made
  -- rather than creating a second one.
  wp_post_id integer,
  published_url text,

  -- Which AI submitted it (claude-ai, chatgpt, claude-code, codex, cursor).
  -- The whole promise of the server-side gate is that quality does not depend
  -- on this value - which is only checkable if it is recorded.
  client_kind text,
  -- What the finishing steps cost US in model spend. Per-article, because a
  -- margin you cannot see is a margin you find out about from a bill.
  cost_usd numeric(10, 4) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The dashboard lists a project's drafts newest-first; the publisher looks for
-- what is finished and due. Both are covered here.
create index if not exists article_drafts_project_created_idx
  on article_drafts (project_id, created_at desc);
create index if not exists article_drafts_status_idx
  on article_drafts (project_id, status);

-- One live draft per suggestion. Without this, an AI that retries a submission
-- instead of updating one leaves duplicates behind, and the publisher has no
-- way to tell which is the real article. Partial, so discarded and rejected
-- attempts can pile up harmlessly as history.
create unique index if not exists article_drafts_active_suggestion_idx
  on article_drafts (suggestion_id)
  where suggestion_id is not null and status in ('submitted', 'accepted', 'finished', 'published');

alter table article_drafts enable row level security;
