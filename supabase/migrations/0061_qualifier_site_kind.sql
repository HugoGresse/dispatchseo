-- The pre-checkout qualifier now asks "what kind of site" as a choice
-- (WordPress, or built with code on GitHub) instead of deriving it from the
-- domain probe alone, and the domain itself became optional on that screen.
-- The explicit answer is what the wizard branches on; the probe stays as the
-- safety net that refuses a Wix/Squarespace/... site behind a confident click.
alter table signup_qualifiers add column if not exists site_kind text;
alter table signup_qualifiers alter column domain drop not null;

comment on column signup_qualifiers.site_kind is
  'What the owner said the site is: wordpress | code. Null on rows from before the two-step qualifier (2026-08-20); those fall back to the detected platform.';
