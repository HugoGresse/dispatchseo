-- mark_pipeline_installed's backend verification result (verifyPipelinePrereqs)
-- was only ever returned in the ephemeral MCP tool-call response the agent
-- sees once - never persisted, so the dashboard's "Pipeline verified" step
-- could only ever show "done" the instant pipeline_installed_at was set, with
-- no way to later distinguish a real backend-checked pass from the no-op that
-- happens whenever no merge/dispatch token is configured (a state the wizard's
-- own "Skip - I'll merge on GitHub" button leads owners into). Persisting it
-- lets the UI tell those two states apart instead of claiming "Verified" for
-- both.
alter table projects add column if not exists pipeline_verified boolean;
