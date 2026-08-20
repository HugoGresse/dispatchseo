-- The adaptive wizard and the second publishing route for chat clients.
--
-- Three small additions, all additive and nullable, so in-flight code that
-- knows nothing about them keeps writing valid rows:
--
--   projects.ai_choice        which AI the owner said will do the writing - the
--                             qualifier's answer carried onto the project so the
--                             wizard, the Connect screen and the Home cards can
--                             branch on it instead of asking again. One of the
--                             qualifier's ids: claude-web, chatgpt, claude-code,
--                             codex, cursor (src/lib/qualifier-options.ts).
--                             Null = never said (created before 0060, or outside
--                             the wizard). Distinct from `agent`, which names the
--                             coding agent the repo builders run and has no
--                             value for a chat app.
--   projects.chat_last_seen_at  the last request that arrived on the MCP door
--                             with ?client=chat. This is the "Connected" light
--                             on the wizard's Claude-app step and on /connect:
--                             evidence that the owner's chat app actually
--                             reached us, rather than a button they press to
--                             say so. Stamped at most every ten minutes.
--   article_drafts.pr_*       a draft published through a GitHub repo rather
--                             than WordPress: the pull request our server
--                             opened, the file it committed, and when the PR
--                             merged. Null on the WordPress route.

alter table projects add column if not exists ai_choice text;
alter table projects add column if not exists chat_last_seen_at timestamptz;

comment on column projects.ai_choice is
  'Which AI the owner said will write (qualifier id: claude-web, chatgpt, claude-code, codex, cursor). Null = never said.';
comment on column projects.chat_last_seen_at is
  'Last MCP request carrying ?client=chat - the "chat app connected" evidence. Stamped at most every 10 minutes.';

alter table article_drafts add column if not exists pr_url text;
alter table article_drafts add column if not exists pr_number integer;
alter table article_drafts add column if not exists repo_path text;
alter table article_drafts add column if not exists pr_merged_at timestamptz;

comment on column article_drafts.repo_path is
  'Repo-relative path of the committed article file when published through a GitHub repo (e.g. content/blog/my-slug.mdx).';
