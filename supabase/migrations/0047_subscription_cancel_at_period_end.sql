-- Whether this subscription is set to end when the current period does.
--
-- Polar keeps a cancelled-at-period-end subscription at status 'active' (or
-- 'trialing') right up to the last day - the customer paid for the period and
-- keeps it. Only when the period actually ends does it flip to 'canceled'.
-- That is exactly the behaviour we want for access, and it is why the status
-- column alone cannot answer "is this plan ending?": a cancelled plan and a
-- renewing one are both 'active' until the very end.
--
-- Without this column the dashboard has no way to show someone that their
-- cancellation landed, which is the difference between a quiet churn and a
-- support email asking "did it work?". Mirrors Polar's own
-- `cancel_at_period_end` field, written by the webhook on every subscription
-- event and optimistically by the cancel action so the page reflects the click
-- before the webhook arrives.
--
-- Self-host never has a row here (no billing), so this is inert there.
alter table subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column subscriptions.cancel_at_period_end is
  'True when the plan is set to end at current_period_end. Status stays active/trialing until then - this is the only signal that a cancellation is pending.';
