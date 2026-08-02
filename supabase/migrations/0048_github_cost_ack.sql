-- The third-site GitHub Actions cost acknowledgement.
--
-- Every site's automations run as GitHub Actions in the OWNER's own repo, on
-- the owner's own GitHub account - a cost we never see and never bill. GitHub's
-- free allowance covers roughly two sites; from the third, a private-repo owner
-- either raises their spending limit or their workflows silently pause, which
-- looks exactly like DispatchSEO breaking. The dashboard has warned about this
-- since the add-site dialog shipped, but the notice was dismissible and easy to
-- scroll past, so nobody had to decide anything.
--
-- This column records that the owner has been shown the cost and made a choice.
-- It is per ACCOUNT, not per project (the GitHub allowance belongs to the
-- account), so it lives on the one-row-per-user subscriptions table rather than
-- in a table of its own.
--
-- `github_cost_ack_reason` records WHICH way out they took, because the answers
-- age differently: someone who raised a spending limit stays fine, while
-- "my repos are public" stops being true the day they flip one private.

alter table subscriptions
  add column if not exists github_cost_ack_at timestamptz;

alter table subscriptions
  add column if not exists github_cost_ack_reason text;

-- No default and no backfill, deliberately. A null means "never asked", which
-- is the truth for every existing account - including the ones already past
-- three sites. They get asked the next time they add one, which is the only
-- moment the question is actionable anyway.
