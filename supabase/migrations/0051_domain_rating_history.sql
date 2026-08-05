-- Domain-rating history: one row per successful DataForSEO backlinks-summary
-- refresh (weekly per project via the daily-ranks cron, plus the occasional
-- stale-cache refresh from a dashboard render).
--
-- domain_ratings deliberately stores only the LATEST snapshot - progress.ts
-- has carried a "DR movement cannot be derived honestly yet" comment since the
-- weekly strip shipped, because a single-row cache has no yesterday. This
-- table is that missing yesterday: an append-only series the authority
-- surfaces read for "referring domains +N this month", the 5-referring-domains
-- journey milestone, and stagnation nudges. Nothing ever updates or deletes a
-- row; refreshDomainRating appends alongside its upsert of the cache row, and
-- a failed insert is swallowed there (history is an enhancement, never a
-- reason a refresh fails).
--
-- Plain table, no Supabase-only objects - vanilla Postgres (the docker
-- stack's setup.sql replay) takes it unguarded.
create table if not exists domain_rating_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade
    default '00000000-0000-4000-8000-000000000001',
  dr int,
  rank int,
  referring_domains int,
  backlinks int,
  spam_score int,
  fetched_at timestamptz not null default now()
);

-- Readers always ask "this project's rows, newest/oldest first".
create index if not exists domain_rating_history_project_fetched_idx
  on domain_rating_history (project_id, fetched_at desc);

-- Same posture as every other table: RLS on, zero policies - only the
-- service-role key (dashboard + MCP server + crons) touches it.
alter table domain_rating_history enable row level security;
