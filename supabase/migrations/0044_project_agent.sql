-- Which coding agent drives a project's builders.
--
-- Until now "the agent" meant Claude Code everywhere - the CI workflows, the
-- docker builder, the connect command, the setup script. Adding a second agent
-- (Codex) needs the choice stored per PROJECT, because one owner can run
-- several sites and the GitHub-Actions path already keeps its credential per
-- repo. Defaults to 'claude' so every existing row keeps behaving exactly as it
-- does today, and so does any in-flight write that predates this column.
alter table projects add column if not exists agent text not null default 'claude';

-- Constrain the values, but only once - re-running this file (the docker stack
-- replays the concatenated setup.sql on every boot) must not fail on an
-- already-present constraint. A plain ADD CONSTRAINT has no IF NOT EXISTS.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_agent_check'
  ) then
    alter table projects
      add constraint projects_agent_check check (agent in ('claude', 'codex'));
  end if;
end $$;

-- The self-host builder credential, one per agent.
--
-- 0037 added a single builder_claude_token at INSTANCE level, which the
-- /api/builder/jobs poll feed hands to the container. That is fine while every
-- project uses the same agent, and breaks the moment one stack hosts a Claude
-- project and a Codex project: there is only one credential slot, so one of
-- them silently gets the wrong one. A column per agent keeps the instance-level
-- storage (the docker stack genuinely has one set of credentials) while letting
-- the feed resolve the RIGHT one per job from the project's agent.
--
-- Nullable on purpose: an instance that only ever runs one agent stores only
-- that agent's credential, and the builder already idles politely when the
-- credential it needs is absent.
alter table instance_settings add column if not exists builder_openai_key text;
