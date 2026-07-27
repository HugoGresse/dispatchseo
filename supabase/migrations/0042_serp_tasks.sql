-- 0042: SERP task-queue ledger.
--
-- Rank checks moved from DataForSEO's live endpoints to its standard task
-- queue (~70% cheaper at the depths we use, and billing is flat by requested
-- depth instead of by pages returned). The daily-ranks cron POSTs tasks and
-- records them here; the serp-collect cron fetches finished tasks, writes
-- rank_checks / AI-visibility rows, and stamps collected_at. A row with
-- collected_at NULL is in flight; error records a task that came back failed
-- (or was abandoned by the queue) so the collector can report it loudly.
--
-- Plain vanilla-Postgres objects only - no Supabase-specific references, so
-- the docker stack's setup.sql replay needs no guard block.

create table if not exists serp_tasks (
  id text primary key,                -- DataForSEO task id
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects(id) on delete cascade,
  keyword_id uuid references keywords(id) on delete cascade,
  keyword text not null,
  -- rank    = daily depth-30 check of a keyword recently seen in the top 30
  -- sweep   = weekly full-depth check (+ AI Overview) of every tracked keyword
  -- confirm = same-day full-depth recheck after a rank task lost the domain
  purpose text not null,
  depth int not null,
  posted_at timestamptz not null default now(),
  collected_at timestamptz,
  error text
);

-- The collector's hot path: pending tasks per project, oldest first.
create index if not exists serp_tasks_pending_idx
  on serp_tasks (project_id, posted_at)
  where collected_at is null;

-- Service-role only, like every operational table (RLS on, zero policies).
alter table serp_tasks enable row level security;
