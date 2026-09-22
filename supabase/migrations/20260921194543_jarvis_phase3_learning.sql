-- Jarvis Phase 3: decision ledger + delayed outcome measurements
-- Extends learning without duplicating marketing_* or replacing jarvis_memory.

CREATE TABLE IF NOT EXISTS public.jarvis_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective text NOT NULL,
  system text NOT NULL DEFAULT 'meta',
  scope text NOT NULL DEFAULT 'GLOBAL_BUSINESS',
  scope_id text,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline_source text,
  measurement_window_hours integer NOT NULL DEFAULT 48
    CHECK (measurement_window_hours IN (24, 48, 72, 168)),
  success_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk text NOT NULL DEFAULT 'medium'
    CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  approval_required boolean NOT NULL DEFAULT true,
  approval_status text NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN (
      'not_required', 'pending', 'approved', 'rejected', 'expired'
    )),
  action_status text NOT NULL DEFAULT 'planned'
    CHECK (action_status IN (
      'planned', 'waiting_for_approval', 'approved', 'executed',
      'verified', 'failed', 'blocked', 'cancelled', 'recorded_not_executed'
    )),
  source text NOT NULL DEFAULT 'JARVIS'
    CHECK (source IN ('JARVIS', 'USER_DIRECTED', 'SYSTEM_AUTOMATION')),
  related_approval_id uuid REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL,
  related_task_id uuid REFERENCES public.jarvis_tasks(id) ON DELETE SET NULL,
  related_tool_call_id uuid REFERENCES public.jarvis_tool_calls(id) ON DELETE SET NULL,
  related_memory_id uuid REFERENCES public.jarvis_memory(id) ON DELETE SET NULL,
  tool_name text,
  action_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_result jsonb,
  verification_state text
    CHECK (verification_state IS NULL OR verification_state IN (
      'VERIFIED', 'EXECUTED_UNVERIFIED', 'FAILED', 'NOT_APPLICABLE',
      'RECORDED_NOT_EXECUTED', 'SKIPPED'
    )),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_decisions_status_idx
  ON public.jarvis_decisions(action_status, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_decisions_scope_idx
  ON public.jarvis_decisions(scope, scope_id);

CREATE TABLE IF NOT EXISTS public.jarvis_outcome_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.jarvis_decisions(id) ON DELETE CASCADE,
  -- Idempotency: one measurement per decision + window
  measurement_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN (
      'scheduled', 'due', 'measuring', 'measured', 'unavailable', 'failed', 'cancelled'
    )),
  due_at timestamptz NOT NULL,
  measured_at timestamptz,
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb,
  comparison jsonb,
  outcome_state text
    CHECK (outcome_state IS NULL OR outcome_state IN (
      'SUCCESS', 'PARTIAL_SUCCESS', 'NO_MEASURABLE_CHANGE', 'UNDERPERFORMED',
      'INCONCLUSIVE', 'UNAVAILABLE', 'FAILED_ACTION'
    )),
  evidence_label text
    CHECK (evidence_label IS NULL OR evidence_label IN (
      'OBSERVED', 'TEMPORALLY_ASSOCIATED', 'REPEATED_PATTERN',
      'SUPPORTED_HYPOTHESIS', 'CAUSALITY_NOT_ESTABLISHED'
    )),
  lesson_memory_id uuid REFERENCES public.jarvis_memory(id) ON DELETE SET NULL,
  outcome_memory_id uuid REFERENCES public.jarvis_memory(id) ON DELETE SET NULL,
  notification_sent boolean NOT NULL DEFAULT false,
  background_job_id uuid REFERENCES public.jarvis_background_jobs(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_outcome_due_idx
  ON public.jarvis_outcome_measurements(status, due_at);

-- Memory lifecycle / scope columns (details still holds rich payload)
ALTER TABLE public.jarvis_memory
  ADD COLUMN IF NOT EXISTS memory_status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'GLOBAL_BUSINESS',
  ADD COLUMN IF NOT EXISTS scope_id text,
  ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES public.jarvis_memory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sample_size integer,
  ADD COLUMN IF NOT EXISTS evidence_label text,
  ADD COLUMN IF NOT EXISTS review_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.jarvis_memory
    ADD CONSTRAINT jarvis_memory_memory_status_check
    CHECK (memory_status IN ('ACTIVE', 'STALE', 'SUPERSEDED', 'ARCHIVED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS jarvis_memory_status_idx ON public.jarvis_memory(memory_status);
CREATE INDEX IF NOT EXISTS jarvis_memory_scope_idx ON public.jarvis_memory(scope, scope_id);

ALTER TABLE public.jarvis_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_decisions" ON public.jarvis_decisions;
CREATE POLICY "Admins read jarvis_decisions"
  ON public.jarvis_decisions FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_decisions" ON public.jarvis_decisions;
CREATE POLICY "Admins write jarvis_decisions"
  ON public.jarvis_decisions FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_outcome_measurements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_outcome_measurements" ON public.jarvis_outcome_measurements;
CREATE POLICY "Admins read jarvis_outcome_measurements"
  ON public.jarvis_outcome_measurements FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_outcome_measurements" ON public.jarvis_outcome_measurements;
CREATE POLICY "Admins write jarvis_outcome_measurements"
  ON public.jarvis_outcome_measurements FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
