-- backlink_prospects had no way to tell "contacted yesterday" from "contacted
-- 6 months ago with no reply" - update_backlink_prospect only ever touched
-- status, so an outreach could go stale forever with zero visibility on the
-- Backlinks dashboard (2026-07-27 audit). Stamp every status transition so
-- the dashboard can flag a prospect stuck in one status too long.
alter table backlink_prospects add column if not exists status_changed_at timestamptz;
