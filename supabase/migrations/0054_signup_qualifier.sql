-- Pre-checkout qualifier answers (cloud only).
--
-- Why this table exists: four paid trials, four losses, none of which ever saw
-- a published article. Two were WordPress sites that hit "Connect GitHub" - a
-- screen no WordPress owner can ever pass - and one of those cancelled inside
-- five minutes with the reason "unused". A fourth had no coding agent and
-- stopped at "Connect your coding agent". Every one of those facts was
-- knowable BEFORE the card was charged: the platform from one HTTP request
-- (src/lib/site-platform.ts), the agent from one question.
--
-- So the answers are collected before checkout and kept, for two jobs:
--   1. Gating: an owner we cannot serve today is told so instead of being
--      charged and walked into a dead end.
--   2. Counting: "how many WordPress owners did we turn away this week" is
--      the number that sizes the audience the WordPress work is being built
--      for. Without a row per attempt, that number does not exist.
--
-- Append-only by design (no unique index on user_id): someone who checks two
-- domains produces two rows, and both are signal. The gate reads the newest
-- row for the user.
--
-- Vanilla-Postgres safe: no auth schema reference outside the guarded DO block
-- at the bottom, so docker's setup.sql replay works on a database that has no
-- Supabase auth at all.

create table if not exists signup_qualifiers (
  id uuid primary key default gen_random_uuid(),
  -- The signed-up cloud user. No FK here - see the guarded block below, which
  -- adds one only where auth.users actually exists.
  user_id uuid not null,
  -- What they typed. Stored raw (bare host, no scheme) so a support question
  -- can be answered from the row alone.
  domain text not null,
  -- Verdict inputs, straight from detectPlatform(): platform + how sure we
  -- were + which signals fired. Keeping the signals makes a wrong call
  -- debuggable months later instead of a mystery.
  platform text not null,
  confidence text,
  signals jsonb not null default '[]'::jsonb,
  -- WordPress specifics when present: version, elementor, seo plugin, whether
  -- /wp-json/ answered, whether it is a decoupled front end.
  wordpress jsonb,
  -- Which AI they said they have. Free text from a fixed option list, not an
  -- enum: the list of agents this product supports changes faster than a
  -- migration cycle, and an unknown value must never reject a write.
  ai_choice text not null,
  -- What we told them: supported | unsupported | unknown, and which publishing
  -- route they would take (repo | wordpress | null).
  verdict text not null,
  route text,
  -- True once this answer let them through to checkout. A row with
  -- proceeded=false is someone we turned away - the churn that did not happen.
  proceeded boolean not null default false,
  created_at timestamptz not null default now()
);

-- The gate reads "newest row for this user", and the weekly count reads
-- "rows in a date range", so both directions are covered by one index.
create index if not exists signup_qualifiers_user_created_idx
  on signup_qualifiers (user_id, created_at desc);
create index if not exists signup_qualifiers_created_idx
  on signup_qualifiers (created_at desc);

-- Same posture as every other table: RLS on, zero policies - service-role only.
alter table signup_qualifiers enable row level security;

comment on table signup_qualifiers is
  'Pre-checkout platform/agent answers. One row per attempt; proceeded=false means we turned them away before charging.';

-- Supabase-only: reference auth.users where that schema exists. Self-host on
-- vanilla Postgres has no auth schema, and this must not break its first boot.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
  ) then
    if not exists (select 1 from pg_constraint where conname = 'signup_qualifiers_user_id_fkey') then
      alter table signup_qualifiers
        add constraint signup_qualifiers_user_id_fkey
        foreign key (user_id) references auth.users (id) on delete cascade;
    end if;
  end if;
end $$;
