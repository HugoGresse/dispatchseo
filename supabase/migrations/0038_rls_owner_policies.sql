-- 0038: RLS policies as a defense-in-depth backstop behind the app-code
-- project_id/owner_user_id scoping (projects.ts, tenant-guard.ts). Every
-- caller today is trusted server code on the service-role key, which bypasses
-- RLS regardless of policy count - so these policies are currently inert, not
-- a fix for a live hole. They exist so that if a client-side/anon-key
-- Supabase path is ever added by mistake, a missed project_id filter in app
-- code still can't leak another owner's rows.
--
-- Supabase-only, same guard as 0031's auth.users FKs: vanilla Postgres (the
-- docker stack) has no auth schema/auth.uid(), so the whole block is a no-op
-- there - self-host isolation is unaffected either way (single owner, no
-- per-row ownership to enforce). Idempotent: checked against pg_policies
-- before creating, safe to re-run (setup.sql applies every migration twice).

do $$
declare
  tbl text;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
  ) then
    -- security definer so the policy check itself doesn't recurse through
    -- projects' own RLS; search_path pinned so it can't be shadowed.
    execute $sql$
      create or replace function project_owned_by_caller(pid uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $fn$
        select exists (
          select 1 from projects p
          where p.id = pid and p.owner_user_id = auth.uid()
        );
      $fn$;
    $sql$;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'projects' and policyname = 'owner_can_access'
    ) then
      execute 'create policy owner_can_access on projects for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid())';
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'owner_can_access'
    ) then
      execute 'create policy owner_can_access on subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
    end if;

    -- Every table scoped by project_id (pages.ts / active-project.ts's tenant
    -- axis) - kept as an explicit list rather than introspected so a future
    -- table is a deliberate addition here, not a silent gap.
    for tbl in select unnest(array[
      'pages', 'keywords', 'rank_checks', 'suggestions', 'gsc_stats',
      'backlink_prospects', 'playbook_status', 'site_profile',
      'domain_ratings', 'conventions', 'trend_topics', 'ai_snapshots',
      'dataforseo_usage'
    ])
    loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = tbl and policyname = 'owner_can_access'
      ) then
        execute format(
          'create policy owner_can_access on %I for all using (project_owned_by_caller(project_id)) with check (project_owned_by_caller(project_id))',
          tbl
        );
      end if;
    end loop;
  end if;
end $$;
