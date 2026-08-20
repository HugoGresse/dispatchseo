-- Background work, off the request path.
--
-- Three things in the new article flow are too slow to do inside an HTTP
-- request and too important to drop: crawling 150 pages of a site, turning an
-- accepted draft into finished HTML with a cover image, and flipping a
-- WordPress draft live at the hour the owner picked. All three now become rows
-- here, and a cron drains them.
--
-- The claim semantics are lifted wholesale from serp_tasks (0042) because that
-- pattern is already proven in this codebase: a row is "still to do" while its
-- finished_at is null, a claim stamps claimed_at so a second worker skips it,
-- and a claim old enough to be abandoned becomes claimable again. No locks, no
-- queue service, no new dependency - the database row IS the lock.
--
-- Deliberately generic (kind + payload) rather than one table per job type:
-- the alternative is three near-identical tables, three drain routes and three
-- sets of the same retry bug.

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects (id) on delete cascade,

  -- crawl | finish | publish | verify. Text, not an enum: a new job type must
  -- be a code change, never a migration that has to reach prod before the code
  -- that needs it (migrations here are applied by hand, so code lands first).
  kind text not null,
  payload jsonb not null default '{}'::jsonb,

  -- Not before this moment. Publishing at the owner's chosen hour and retrying
  -- after a failure are the same mechanism: move run_after and let go.
  run_after timestamptz not null default now(),

  -- Claimed but not finished = in flight. A worker that dies leaves this set
  -- and finished_at null, which the drain route treats as reclaimable after a
  -- grace window rather than as a job stuck forever.
  claimed_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0,
  -- Last failure, in the worker's own words. Populated even when the job is
  -- later retried successfully, because "this kept failing for six hours and
  -- then worked" is the shape of a problem worth seeing.
  error text,

  created_at timestamptz not null default now()
);

-- The drain query is "what is due for anyone", so the index leads with the
-- pending predicate. Partial: finished rows are history and must not bloat the
-- hot path.
create index if not exists jobs_due_idx
  on jobs (run_after, project_id)
  where finished_at is null;

create index if not exists jobs_project_created_idx
  on jobs (project_id, created_at desc);

-- Idempotency. A cron that fires twice, a webhook that retries, an owner who
-- double-clicks: all three must produce ONE job. The key is chosen by the
-- producer (e.g. "publish:<draft-id>", "crawl:<project>:<date>"), and the
-- partial uniqueness means a finished job's key is free to be used again -
-- tomorrow's crawl is not blocked by yesterday's.
alter table jobs add column if not exists idempotency_key text;
create unique index if not exists jobs_pending_key_idx
  on jobs (project_id, kind, idempotency_key)
  where finished_at is null and idempotency_key is not null;

-- Same posture as every other table: RLS on, zero policies - service-role only.
alter table jobs enable row level security;

comment on table jobs is
  'Generic background work queue drained by a cron. finished_at null = still to do; claimed_at set = in flight, reclaimable after a grace window.';
