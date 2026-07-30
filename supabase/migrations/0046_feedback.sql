-- 0046: the product feedback board.
--
-- What the dashboard's /feedback screen is backed by: feature requests written
-- by the people using DispatchSEO, and one vote per person per request so the
-- ordering is theirs rather than the owner's.
--
-- Deliberately NOT project-scoped, which is the one place this table breaks the
-- house rule that every operational table carries a project_id. A feedback
-- board only works if everyone sees the same list: scoping rows to a project
-- would give each tenant a private board of one, which is the thing the feature
-- exists to avoid. project_id survives as nullable ATTRIBUTION - which site the
-- author was looking at when they wrote it - and nothing reads it as a filter.
--
-- The two deployment modes use this differently:
--   CLOUD_MODE   - the full board. Many accounts, so author_user_id is set and
--                  feedback_votes can enforce one vote per account.
--   self-host    - one person, so there is no board to show. The row is still
--                  written (it rate-limits submissions and keeps the text if
--                  the email fails), the UI just says thank you, and the
--                  request is emailed to the DispatchSEO team.
--
-- Plain vanilla-Postgres objects only - no Supabase-specific references, so the
-- docker stack's setup.sql replay needs no guard block. author_user_id is a
-- bare uuid rather than a reference to auth.users for exactly that reason: the
-- auth schema does not exist on a self-hosted vanilla Postgres.

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  -- The request itself. Plain text, always: the app rejects links and markup at
  -- submit time, so nothing here is ever rendered as anything but text.
  title text not null,
  body text not null default '',
  -- open | planned | in_progress | shipped | declined. Free text rather than an
  -- enum so adding a status later is a code change, not a migration.
  status text not null default 'open',
  -- Supabase auth uid in CLOUD_MODE, null on self-host (no accounts there).
  author_user_id uuid,
  -- Kept so the owner can reply to whoever asked; never shown on the board.
  author_email text,
  -- Attribution only - see the note above. ON DELETE SET NULL, not CASCADE:
  -- deleting a site must not delete the feedback that site's owner wrote.
  project_id uuid references projects(id) on delete set null,
  -- The moderation lever. Hidden rows stay in the table (so a re-post from the
  -- same author still trips the duplicate/rate checks) and drop off the board.
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  status_changed_at timestamptz
);

-- The board's default read: visible rows, newest first. Votes are counted from
-- feedback_votes rather than a denormalized column - at board scale the count
-- is cheap, and a cached integer that drifts from the votes it summarizes is a
-- bug you only notice once the ordering is already wrong.
create index if not exists feedback_visible_idx
  on feedback (created_at desc)
  where hidden = false;

-- One vote per account per request; the primary key IS that rule, so a double
-- click races into a duplicate-key error instead of a second vote.
create table if not exists feedback_votes (
  feedback_id uuid not null references feedback(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (feedback_id, user_id)
);

-- Counting a person's recent votes (the abuse limiter) reads by user + time.
create index if not exists feedback_votes_user_idx on feedback_votes (user_id, created_at desc);

-- Rate limiting counts a person's recent submissions.
create index if not exists feedback_author_idx on feedback (author_user_id, created_at desc);

-- Service-role only, like every operational table (RLS on, zero policies).
alter table feedback enable row level security;
alter table feedback_votes enable row level security;
