-- Business analytics: AI generation cost tracking on existing logs

ALTER TABLE ai_generation_logs
  ADD COLUMN IF NOT EXISTS input_cost_usd numeric(12, 6),
  ADD COLUMN IF NOT EXISTS output_cost_usd numeric(12, 6),
  ADD COLUMN IF NOT EXISTS total_cost_usd numeric(12, 6);

CREATE INDEX IF NOT EXISTS ai_generation_logs_total_cost_usd_idx ON ai_generation_logs(total_cost_usd);
CREATE INDEX IF NOT EXISTS ai_generation_logs_created_at_cost_idx ON ai_generation_logs(created_at DESC)
  WHERE total_cost_usd IS NOT NULL;
