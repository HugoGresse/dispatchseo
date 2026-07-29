-- Whether the guide builder may edit ALREADY-PUBLISHED posts.
--
-- Every builder behaviour up to now has been additive: propose an idea, write a
-- new page, open a PR that only adds files. Internal back-linking is the first
-- thing that reaches back into content the owner already published and shipped
-- - it edits 2-3 existing posts so they link to the new one, which is what
-- turns a pile of posts into a cluster that compounds.
--
-- That is a different trust category from everything else the agent does, so it
-- is opt-in per project and defaults to OFF. An owner who never flips it keeps
-- today's behaviour byte for byte. Do NOT seed this to true for any project
-- here: the docker stack replays the concatenated setup.sql on every boot, so a
-- seeded UPDATE would silently switch the feature on for every self-host
-- install's default project.
alter table projects
  add column if not exists internal_linking boolean not null default false;

comment on column projects.internal_linking is
  'Opt-in: allow the guide builder to edit already-published posts to add internal links back to a new guide. Default false - this is the only agent behaviour that modifies existing published content.';
