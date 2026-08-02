-- Anonymous install id for the self-host heartbeat (src/lib/heartbeat.ts).
--
-- A random UUID and nothing else. It exists so the project can answer "how
-- many self-hosted installs are actually running" - a question clone counts
-- and GHCR pulls cannot answer, because neither can tell one machine booting
-- ten times from ten machines booting once. It identifies an INSTALL, never a
-- person: it is not derived from the domain, the owner's email, the tracked
-- keywords or anything else in this database, so it carries no signal beyond
-- "this install was alive today".
--
-- Generated lazily on the first heartbeat rather than at claim time, so
-- installs that were claimed before this migration get one too. Nullable for
-- the same reason, and because DISPATCH_INSTALL_ID in the env wins over it
-- (that is the docker path - start.sh writes one into .env on first boot,
-- which covers stacks that never ran the setup wizard and therefore have no
-- instance_settings row at all).
--
-- The owner can switch the whole thing off with DISPATCHSEO_TELEMETRY=off,
-- in which case this column is written but never read.
alter table instance_settings
  add column if not exists install_id text;

comment on column instance_settings.install_id is
  'Random UUID identifying this install for the anonymous daily heartbeat. Not derived from any tenant data. Unused when DISPATCHSEO_TELEMETRY=off.';
