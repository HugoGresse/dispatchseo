-- Research a chat session can hand to the next chat session.
--
-- On a coding agent, research and writing happen in one long run and the
-- findings live in its context. A chat app has neither the window nor the
-- continuity: a $20 plan cannot hold a SERP sweep, three competitor pages and
-- a finished article in one conversation, and the owner closes the tab anyway.
-- Splitting the work in two - one chat researches, another writes - is the
-- only shape that fits, and it needs somewhere to put the findings in between.
--
-- The notes are free-form jsonb because the shape is the AI's business, not
-- ours: SERP observations, competitor gaps, an outline, an angle. Our side
-- stores and returns them; nothing here parses them.

create table if not exists research_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references projects (id) on delete cascade,
  -- Which queued idea this research is for. Nullable: an owner can ask their
  -- AI to look into something that was never in the queue, and a note with
  -- nowhere to attach is still worth keeping.
  suggestion_id uuid references suggestions (id) on delete cascade,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live note per idea, so a second research pass REPLACES the first rather
-- than leaving the writing session to guess which of two versions is current.
--
-- NOT a partial index (`where suggestion_id is not null`), which is what this
-- started as: PostgREST's upsert issues ON CONFLICT (project_id,
-- suggestion_id), and Postgres will not use a partial index as the arbiter for
-- that unless the statement carries the same predicate - so every upsert
-- failed with "no unique or exclusion constraint matching the ON CONFLICT
-- specification". A full index does the same job here anyway: Postgres treats
-- NULLs as distinct, so the unattached notes above are each their own row and
-- only the ones tied to an idea are deduped.
create unique index if not exists research_notes_suggestion_idx
  on research_notes (project_id, suggestion_id);

-- The unattached notes, newest first: what the dashboard and get_research_notes
-- list when no suggestion is named.
create index if not exists research_notes_project_created_idx
  on research_notes (project_id, created_at desc);

alter table research_notes enable row level security;
