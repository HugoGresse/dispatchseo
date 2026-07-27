-- Seed data for the setup.sql replay test (migrations-vanilla-postgres.yml).
--
-- WHY THIS FILE EXISTS: that workflow used to apply setup.sql twice against an
-- EMPTY database and call it an idempotency check. On empty tables every
-- `check` constraint and every foreign key passes vacuously, so the second
-- apply could only ever catch pure-DDL conflicts - it proved nothing about the
-- replay the docker stack actually performs, which runs against a database
-- full of the owner's real rows.
--
-- That false confidence shipped a live bug: 0013 added
-- check (source in ('research','trend-scan')) and 0014 widened it to include
-- 'manual', so replaying the full history re-applied the NARROW version to
-- data that legitimately contained 'manual'. Every self-host stack whose owner
-- had used the dashboard's Add-idea form stopped booting - and CI was green
-- the whole time, because its database had no suggestions in it (2026-07-27).
--
-- WHAT TO PUT HERE: one row exercising the WIDEST legal value of every column
-- whose constraint is (re-)established by a standalone `alter table ... add
-- constraint` - those re-validate every row on each replay, unlike
-- `add column if not exists`, which is a no-op once the column exists. Rows in
-- the child tables additionally give the foreign keys 0006 re-adds something
-- real to validate against.
--
-- Runs BETWEEN the two setup.sql applies. Written to be idempotent itself.

-- The fixed default project 0004 seeds; every project_id default points here.
\set proj '00000000-0000-4000-8000-000000000001'

-- Widest legal value for each constrained projects column.
-- mode 'custom' comes from 0011 (0004's original inline check allowed only
-- semi|auto), keyword_source/content_mode from 0009/0017.
update projects
   set mode = 'custom',
       keyword_source = 'gsc',
       content_mode = 'existing'
 where id = :'proj';

-- Every legal suggestions.source. 'manual' (0014) is the value that caught
-- the 0013 landmine - do not drop it from this list.
insert into suggestions (project_id, type, title, source)
select :'proj', 'guide', 'ci replay probe: ' || s.source, s.source
  from (values ('research'), ('trend-scan'), ('manual')) as s(source)
 where not exists (
   select 1 from suggestions
    where title = 'ci replay probe: ' || s.source
 );

-- Child rows so 0006's foreign-key re-adds validate against real data.
insert into pages (id, project_id, url, title, type)
values ('00000000-0000-4000-8000-0000000000a1', :'proj',
        'https://ci-probe.example.com/page', 'ci replay probe', 'guide')
on conflict do nothing;

insert into keywords (id, project_id, keyword, target_page_id)
values ('00000000-0000-4000-8000-0000000000a2', :'proj',
        'ci replay probe keyword', '00000000-0000-4000-8000-0000000000a1')
on conflict do nothing;

insert into rank_checks (id, project_id, keyword_id, position)
values ('00000000-0000-4000-8000-0000000000a3', :'proj',
        '00000000-0000-4000-8000-0000000000a2', 1)
on conflict do nothing;

insert into gsc_stats (project_id, date, clicks, impressions)
values (:'proj', current_date, 1, 1)
on conflict do nothing;

-- status 'contacted' also exercises 0041's status_changed_at column.
insert into backlink_prospects (id, project_id, domain, status, status_changed_at)
values ('00000000-0000-4000-8000-0000000000a4', :'proj',
        'ci-probe.example.com', 'contacted', now())
on conflict do nothing;

insert into playbook_status (project_id, slug, status)
values (:'proj', 'ci-replay-probe', 'done')
on conflict do nothing;

insert into site_profile (project_id, name, url, tagline, short_description, long_description)
values (:'proj', 'ci replay probe', 'https://ci-probe.example.com',
        'ci tagline', 'ci short description', 'ci long description')
on conflict do nothing;
