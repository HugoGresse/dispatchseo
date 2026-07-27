-- 0015: age-based publishing pace.
--
-- projects.site_launched_at is when the SITE went live - not when the project
-- was added to DispatchSEO. It drives the publishing-pace tiers (pacing.ts):
-- young sites publish slower, established sites ramp up to daily. Backfilled
-- from created_at (the best guess we have); the owner can correct it on the
-- Settings page.

-- The backfill runs ONLY when this migration actually adds the column.
--
-- setup.sql concatenates every migration and the docker stack REPLAYS it in
-- full on every boot. An unconditional `update` here therefore re-ran forever:
-- every restart reset every project's site_launched_at back to created_at,
-- silently discarding BOTH the owner's Settings correction and the RDAP
-- domain-registration date createProjectCore seeds at creation - so an
-- established site kept reverting to "joined DispatchSEO today" and the
-- Journey/site-age readout lied after each reboot (2026-07-27).
--
-- Same replay rule as 0013/0014: a statement that rewrites EXISTING rows must
-- be gated on the schema change it belongs to, or it becomes a landmine that
-- fires on every boot. `add column if not exists` is self-guarding; a bare
-- `update` is not.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'site_launched_at'
  ) then
    alter table projects
      add column site_launched_at timestamptz not null default now();
    update projects set site_launched_at = created_at;
  end if;
end $$;
