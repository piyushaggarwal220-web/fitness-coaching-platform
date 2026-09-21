-- LURVOX JARVIS — AI Business Operator foundation
-- Extends AI Marketing OS; does not replace marketing_* tables.

CREATE TABLE IF NOT EXISTS public.jarvis_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'New conversation',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jarvis_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.jarvis_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL DEFAULT '',
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  tool_call_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_messages_conversation_idx
  ON public.jarvis_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.jarvis_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.jarvis_conversations(id) ON DELETE SET NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'running', 'awaiting_approval', 'completed',
      'failed', 'cancelled', 'budget_exhausted', 'paused'
    )),
  priority integer NOT NULL DEFAULT 50,
  source text NOT NULL DEFAULT 'chat'
    CHECK (source IN ('chat', 'cron', 'event', 'system')),
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  budget_usd numeric(12, 6) NOT NULL DEFAULT 0.5,
  spent_usd numeric(12, 6) NOT NULL DEFAULT 0,
  max_tokens integer NOT NULL DEFAULT 50000,
  tokens_used integer NOT NULL DEFAULT 0,
  max_tool_calls integer NOT NULL DEFAULT 12,
  tool_calls_used integer NOT NULL DEFAULT 0,
  funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_tasks_status_idx ON public.jarvis_tasks(status);

CREATE TABLE IF NOT EXISTS public.jarvis_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.jarvis_tasks(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.jarvis_conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.jarvis_messages(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  risk_class text NOT NULL DEFAULT 'READ'
    CHECK (risk_class IN ('READ', 'LOW_RISK', 'SIGNIFICANT', 'DANGEROUS')),
  permission_result text NOT NULL DEFAULT 'pending'
    CHECK (permission_result IN (
      'pending', 'allowed', 'requires_approval', 'blocked', 'executed', 'failed'
    )),
  approval_id uuid,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  actual_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jarvis_tool_calls_tool_idx ON public.jarvis_tool_calls(tool_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.jarvis_conversations(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.jarvis_tasks(id) ON DELETE SET NULL,
  tool_call_id uuid REFERENCES public.jarvis_tool_calls(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  action_label text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_cost_note text,
  risk_level text NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_class text NOT NULL DEFAULT 'SIGNIFICANT'
    CHECK (risk_class IN ('READ', 'LOW_RISK', 'SIGNIFICANT', 'DANGEROUS')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'modified', 'expired', 'executed', 'failed')),
  modification jsonb,
  marketing_action_id uuid REFERENCES public.marketing_ai_actions(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  execution_result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_approvals_status_idx ON public.jarvis_approvals(status, created_at DESC);

ALTER TABLE public.jarvis_tool_calls
  DROP CONSTRAINT IF EXISTS jarvis_tool_calls_approval_id_fkey;
ALTER TABLE public.jarvis_tool_calls
  ADD CONSTRAINT jarvis_tool_calls_approval_id_fkey
  FOREIGN KEY (approval_id) REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.jarvis_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL
    CHECK (category IN (
      'business_rule', 'funnel_economics', 'experiment', 'creative',
      'audience', 'research', 'decision', 'outcome', 'preference', 'insight'
    )),
  title text NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL,
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('low', 'medium', 'high')),
  tags text[] NOT NULL DEFAULT '{}',
  source text,
  related_decision_id uuid,
  expires_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_memory_category_idx ON public.jarvis_memory(category);
CREATE INDEX IF NOT EXISTS jarvis_memory_funnel_idx ON public.jarvis_memory(funnel_id);
CREATE INDEX IF NOT EXISTS jarvis_memory_tags_idx ON public.jarvis_memory USING gin(tags);

CREATE TABLE IF NOT EXISTS public.jarvis_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective text NOT NULL,
  decision_context text,
  question text NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN (
      'planned', 'running', 'completed', 'stopped_budget',
      'stopped_sufficient', 'failed', 'cancelled'
    )),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  conclusion text,
  confidence text CHECK (confidence IN ('low', 'medium', 'high')),
  decision_influenced text,
  budget_usd numeric(12, 6) NOT NULL DEFAULT 0.5,
  spent_usd numeric(12, 6) NOT NULL DEFAULT 0,
  max_searches integer NOT NULL DEFAULT 10,
  searches_used integer NOT NULL DEFAULT 0,
  max_tokens integer NOT NULL DEFAULT 50000,
  tokens_used integer NOT NULL DEFAULT 0,
  task_id uuid REFERENCES public.jarvis_tasks(id) ON DELETE SET NULL,
  memory_id uuid REFERENCES public.jarvis_memory(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.jarvis_cost_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date date NOT NULL DEFAULT (timezone('utc', now()))::date,
  provider text NOT NULL DEFAULT 'openai',
  model text,
  task_id uuid REFERENCES public.jarvis_tasks(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.jarvis_conversations(id) ON DELETE SET NULL,
  tool_name text,
  category text NOT NULL DEFAULT 'chat'
    CHECK (category IN (
      'chat', 'tool', 'research', 'background', 'image', 'video', 'other'
    )),
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  actual_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_cost_usage_date_idx ON public.jarvis_cost_usage(usage_date);
CREATE INDEX IF NOT EXISTS jarvis_cost_usage_provider_idx ON public.jarvis_cost_usage(provider, usage_date);

CREATE TABLE IF NOT EXISTS public.jarvis_background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'running', 'completed', 'failed', 'paused', 'skipped', 'budget_exhausted'
    )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  spent_usd numeric(12, 6) NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_background_jobs_status_idx
  ON public.jarvis_background_jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'info'
    CHECK (kind IN ('info', 'alert', 'approval', 'activity', 'cost', 'learning')),
  title text NOT NULL,
  body text NOT NULL,
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jarvis_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.jarvis_settings (key, value) VALUES
  ('daily_ai_budget_usd', '10'::jsonb),
  ('monthly_ai_budget_usd', '200'::jsonb),
  ('per_task_budget_usd', '1'::jsonb),
  ('per_research_budget_usd', '0.5'::jsonb),
  ('per_chat_budget_usd', '0.75'::jsonb),
  ('max_tokens_per_task', '50000'::jsonb),
  ('max_searches_per_research', '10'::jsonb),
  ('max_tool_calls_per_task', '12'::jsonb),
  ('autonomy_enabled', 'true'::jsonb),
  ('background_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS: platform admins only
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jarvis_conversations', 'jarvis_messages', 'jarvis_tasks', 'jarvis_tool_calls',
    'jarvis_approvals', 'jarvis_memory', 'jarvis_research', 'jarvis_cost_usage',
    'jarvis_background_jobs', 'jarvis_notifications', 'jarvis_settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins read %I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Admins read %I" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin())',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS "Admins write %I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Admins write %I" ON public.%I FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin())',
      t, t
    );
  END LOOP;
END $$;
