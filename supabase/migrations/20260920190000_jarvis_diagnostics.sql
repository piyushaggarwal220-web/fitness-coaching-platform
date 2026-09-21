-- Jarvis self-diagnostic operator: incidents, runs, regression tests

CREATE TABLE IF NOT EXISTS public.jarvis_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id text NOT NULL UNIQUE,
  detected_at timestamptz NOT NULL DEFAULT now(),
  system text NOT NULL,
  user_request text,
  symptom text NOT NULL,
  diagnostic_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  root_cause text,
  proposed_fix jsonb,
  approval_id uuid REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL,
  fix jsonb,
  verification jsonb,
  resolution text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open', 'investigating', 'diagnosed', 'awaiting_approval', 'approved',
      'applying', 'testing', 'resolved', 'wont_fix', 'budget_exhausted', 'failed'
    )),
  risk_level text NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  memory_id uuid REFERENCES public.jarvis_memory(id) ON DELETE SET NULL,
  data_status text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_incidents_status_idx ON public.jarvis_incidents(status, detected_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_incidents_system_idx ON public.jarvis_incidents(system, detected_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_diagnostic_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES public.jarvis_incidents(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'investigate',
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'budget_exhausted', 'stopped')),
  problem text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  spent_usd numeric(12, 6) NOT NULL DEFAULT 0,
  steps_used integer NOT NULL DEFAULT 0,
  tool_calls_used integer NOT NULL DEFAULT 0,
  budget_exhausted boolean NOT NULL DEFAULT false,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jarvis_diagnostic_runs_created_idx ON public.jarvis_diagnostic_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_regression_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES public.jarvis_incidents(id) ON DELETE SET NULL,
  name text NOT NULL,
  assertion text NOT NULL,
  system text NOT NULL,
  test_kind text NOT NULL DEFAULT 'invariant',
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'failing', 'passing')),
  last_run_at timestamptz,
  last_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_regression_tests_system_idx ON public.jarvis_regression_tests(system, created_at DESC);

ALTER TABLE public.jarvis_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_diagnostic_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_regression_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read jarvis_incidents" ON public.jarvis_incidents;
CREATE POLICY "Admins read jarvis_incidents"
  ON public.jarvis_incidents FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_incidents" ON public.jarvis_incidents;
CREATE POLICY "Admins write jarvis_incidents"
  ON public.jarvis_incidents FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins read jarvis_diagnostic_runs" ON public.jarvis_diagnostic_runs;
CREATE POLICY "Admins read jarvis_diagnostic_runs"
  ON public.jarvis_diagnostic_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_diagnostic_runs" ON public.jarvis_diagnostic_runs;
CREATE POLICY "Admins write jarvis_diagnostic_runs"
  ON public.jarvis_diagnostic_runs FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins read jarvis_regression_tests" ON public.jarvis_regression_tests;
CREATE POLICY "Admins read jarvis_regression_tests"
  ON public.jarvis_regression_tests FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_regression_tests" ON public.jarvis_regression_tests;
CREATE POLICY "Admins write jarvis_regression_tests"
  ON public.jarvis_regression_tests FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
