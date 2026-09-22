-- Jarvis Phase 12: Controlled Autonomous Execution
-- Receipts, locks, reservations, incidents, canaries. Approval expires_at.

ALTER TABLE public.jarvis_approvals
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS jarvis_approvals_expires_idx
  ON public.jarvis_approvals(expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.jarvis_execution_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid,
  task_id uuid REFERENCES public.jarvis_tasks(id) ON DELETE SET NULL,
  decision_id uuid,
  tool_call_id uuid REFERENCES public.jarvis_tool_calls(id) ON DELETE SET NULL,
  admin_user_id uuid,
  system text NOT NULL DEFAULT 'OTHER',
  action_class text NOT NULL DEFAULT 'UNKNOWN',
  tool_name text NOT NULL,
  target_type text,
  target_id text,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  policy_decision text,
  policy_reason text,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  actual_cost_usd numeric(12, 6),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status text,
  verification_summary text,
  failure_code text,
  failure_message text,
  rollback_status text,
  provider_reference text,
  dry_run boolean NOT NULL DEFAULT false,
  shadow boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_execution_receipts_idempotency_idx
  ON public.jarvis_execution_receipts(idempotency_key, created_at DESC);

CREATE INDEX IF NOT EXISTS jarvis_execution_receipts_status_idx
  ON public.jarvis_execution_receipts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS jarvis_execution_receipts_tool_idx
  ON public.jarvis_execution_receipts(tool_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_execution_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text,
  system text,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  actual_cost_usd numeric(12, 6),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'consumed', 'released')),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_execution_reservations_created_idx
  ON public.jarvis_execution_reservations(created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_execution_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_key text NOT NULL UNIQUE,
  owner text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_execution_locks_expires_idx
  ON public.jarvis_execution_locks(expires_at);

CREATE TABLE IF NOT EXISTS public.jarvis_execution_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  system text NOT NULL,
  tool_name text NOT NULL,
  target_id text,
  error_class text NOT NULL,
  message text NOT NULL,
  receipt_id uuid REFERENCES public.jarvis_execution_receipts(id) ON DELETE SET NULL,
  recommended_next text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_execution_incidents_open_fp_uidx
  ON public.jarvis_execution_incidents(fingerprint)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.jarvis_execution_canaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system text NOT NULL,
  action_class text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  cooldown_hours integer NOT NULL DEFAULT 24,
  last_run_at timestamptz,
  max_cost_usd numeric(12, 6) NOT NULL DEFAULT 0.25,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (system, action_class)
);

-- Seed safe defaults into jarvis_settings (do not enable kill switch by default —
-- unset JARVIS_EXECUTION_ENABLED keeps approved writes working; explicit false kills writes)
INSERT INTO public.jarvis_settings (key, value)
VALUES
  ('execution_kill_switch', 'false'::jsonb),
  ('execution_mode', '"approval"'::jsonb),
  ('execution_dry_run', 'false'::jsonb),
  ('execution_shadow_mode', 'false'::jsonb),
  ('approval_ttl_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jarvis_execution_receipts',
    'jarvis_execution_reservations',
    'jarvis_execution_locks',
    'jarvis_execution_incidents',
    'jarvis_execution_canaries'
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
