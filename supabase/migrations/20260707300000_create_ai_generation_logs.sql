-- AI generation trace logs for admin debugging and QA

CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL,
  action text NOT NULL,
  model text,
  prompt_version text NOT NULL DEFAULT 'v1',
  latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  retry_count integer NOT NULL DEFAULT 0,
  validation_result text,
  success boolean NOT NULL DEFAULT false,
  knowledge_refs jsonb,
  raw_output jsonb,
  rendered_output jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_generation_logs_created_at_idx ON ai_generation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_generation_logs_success_idx ON ai_generation_logs(success);
CREATE INDEX IF NOT EXISTS ai_generation_logs_model_idx ON ai_generation_logs(model);
CREATE INDEX IF NOT EXISTS ai_generation_logs_action_idx ON ai_generation_logs(action);
CREATE INDEX IF NOT EXISTS ai_generation_logs_client_id_idx ON ai_generation_logs(client_id);
CREATE INDEX IF NOT EXISTS ai_generation_logs_coach_id_idx ON ai_generation_logs(coach_id);

ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai generation logs"
  ON ai_generation_logs FOR SELECT
  USING (public.is_platform_admin());

-- Inserts performed via service role from server routes only
