-- Jarvis Phase 2: real-world capabilities schema extensions

-- Expand video job statuses for real provider lifecycle
ALTER TABLE public.video_edit_jobs DROP CONSTRAINT IF EXISTS video_edit_jobs_status_check;
ALTER TABLE public.video_edit_jobs
  ADD CONSTRAINT video_edit_jobs_status_check
  CHECK (status IN (
    'queued', 'analyzing', 'editing', 'rendering', 'processing',
    'completed', 'failed', 'cancelled', 'review_required', 'awaiting_approval'
  ));

ALTER TABLE public.video_edit_jobs
  ADD COLUMN IF NOT EXISTS approval_status text
    CHECK (approval_status IS NULL OR approval_status IN (
      'none', 'pending', 'approved', 'rejected'
    )),
  ADD COLUMN IF NOT EXISTS output_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS edit_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_job_id text,
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;

-- Research hard limits
ALTER TABLE public.jarvis_research
  ADD COLUMN IF NOT EXISTS max_sources integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS max_runtime_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stop_reason text;

-- Task paused for budget (no retry loop)
ALTER TABLE public.jarvis_tasks DROP CONSTRAINT IF EXISTS jarvis_tasks_status_check;
ALTER TABLE public.jarvis_tasks
  ADD CONSTRAINT jarvis_tasks_status_check
  CHECK (status IN (
    'queued', 'running', 'awaiting_approval', 'completed',
    'failed', 'cancelled', 'budget_exhausted', 'paused', 'paused_budget'
  ));

-- Event-driven task triggers (lightweight)
CREATE TABLE IF NOT EXISTS public.jarvis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'skipped', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jarvis_events_status_idx ON public.jarvis_events(status, created_at);

ALTER TABLE public.jarvis_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_events" ON public.jarvis_events;
CREATE POLICY "Admins read jarvis_events"
  ON public.jarvis_events FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_events" ON public.jarvis_events;
CREATE POLICY "Admins write jarvis_events"
  ON public.jarvis_events FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Daily activity digest snapshots
CREATE TABLE IF NOT EXISTS public.jarvis_activity_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL UNIQUE,
  observed jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  learned jsonb NOT NULL DEFAULT '[]'::jsonb,
  waiting jsonb NOT NULL DEFAULT '[]'::jsonb,
  spent_usd numeric(12, 6) NOT NULL DEFAULT 0,
  recommends jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jarvis_activity_digests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_activity_digests" ON public.jarvis_activity_digests;
CREATE POLICY "Admins read jarvis_activity_digests"
  ON public.jarvis_activity_digests FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_activity_digests" ON public.jarvis_activity_digests;
CREATE POLICY "Admins write jarvis_activity_digests"
  ON public.jarvis_activity_digests FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
