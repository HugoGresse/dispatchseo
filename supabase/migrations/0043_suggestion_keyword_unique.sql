-- 0043: one keyword, one live idea.
--
-- Both insert paths into suggestions (the MCP propose_suggestion tool and the
-- dashboard's Add idea form) inserted unconditionally; the only dedupe that
-- existed was a line in the agent instructions telling each research run to
-- pull the queue first. A run that checked only one status re-proposed an
-- already-approved keyword, the owner approved the second copy from Home, and
-- the queue listed the same guide twice (2026-07-29, "claude code hooks") -
-- two builders, two PRs, one keyword competing with itself.
--
-- src/lib/suggestion-dedupe.ts is the readable check both callers now run;
-- this index is the race-proof backstop under it. Scoped to LIVE rows only:
-- rejected ideas and shipped guides are history, and a keyword may legitimately
-- be revisited once its first guide is done (the app answers that case with a
-- note rather than a block).
--
-- Plain vanilla-Postgres objects only - no Supabase-specific references, so
-- the docker stack's setup.sql replay needs no guard block. lower()/btrim()
-- are IMMUTABLE, so both are legal in an index expression.

create unique index if not exists suggestions_live_keyword_idx
  on suggestions (project_id, type, lower(btrim(primary_keyword)))
  where status in ('pending', 'approved', 'in_progress') and primary_keyword is not null;
