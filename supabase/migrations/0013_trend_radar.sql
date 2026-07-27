-- 0013: the trend radar - hype-window guide ideas with their own approval gate.
--
-- suggestions.source records which automation queued an idea: 'research' (the
-- weekly run - also the default, so every existing row keeps its meaning) or
-- 'trend-scan' (the Mon/Thu hype scan). Trend ideas get their own approval
-- flag because their value decays in days: with auto_trend on, the scan's
-- single best find approves itself and the daily builder ships it FIRST
-- (newest-first inside a 14-day freshness window - see the build-guide
-- instructions); off, trend ideas wait as pending like everything else.
-- Default true matches 0011's posture (existing projects run auto today).
--
-- projects.last_trend_scan_at lets the scheduled scan skip itself when a
-- manual Scan-now already ran within the last 48 hours; the scan stamps it
-- via the record_trend_scan MCP tool.

alter table suggestions
  add column if not exists source text not null default 'research';
-- The suggestions_source_check constraint deliberately lives in 0014, NOT
-- here, even though this migration introduced the column.
--
-- setup.sql concatenates every migration and is REPLAYED IN FULL on every
-- docker-stack boot (see migrations-vanilla-postgres.yml). Unlike
-- `add column if not exists`, a standalone `add constraint ... check` re-runs
-- and re-validates EVERY existing row each replay - so a narrower
-- intermediate vocabulary here becomes a landmine the moment a later
-- migration widens it. This migration used to add
-- check (source in ('research', 'trend-scan')); 0014 then widened it to
-- include 'manual'. Any database with a single manual idea in it therefore
-- failed to replay setup.sql at THIS line - i.e. every self-host stack whose
-- owner had ever used the dashboard's Add-idea form stopped booting
-- (2026-07-27).
--
-- RULE: when a later migration widens a check constraint, the earlier
-- narrower version must not survive in the replayed history. Only the final
-- vocabulary is applied (0014), which every legal row satisfies by
-- definition.

alter table projects
  add column if not exists auto_trend boolean not null default true,
  add column if not exists last_trend_scan_at timestamptz;
