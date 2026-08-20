-- blocked_setup joins the statuses that make a draft "live".
--
-- 0055's one-live-draft-per-suggestion index enumerated the live statuses as
-- submitted/accepted/finished/published - and missed blocked_setup, the draft
-- that passed the gate, was rendered, and is parked only because the site has
-- nowhere to publish yet. In every sense that matters it is an accepted
-- article waiting to go out, so while one is parked a second submission for
-- the same idea could slip past the index and become a second live draft -
-- two articles for one idea the moment the owner connects their site. The
-- code-side checks (submit_article's prior-draft lookup and dedupe corpus)
-- were widened in the same change; this brings the constraint itself along.
--
-- Safe to apply on a live database: article_drafts is new (0055, 2026-08-18)
-- and recreating a partial index on it is instant at this size. Vanilla-
-- Postgres safe: no auth schema, nothing Supabase-specific.

drop index if exists article_drafts_active_suggestion_idx;
create unique index if not exists article_drafts_active_suggestion_idx
  on article_drafts (suggestion_id)
  where suggestion_id is not null
    and status in ('submitted', 'accepted', 'blocked_setup', 'finished', 'published');
