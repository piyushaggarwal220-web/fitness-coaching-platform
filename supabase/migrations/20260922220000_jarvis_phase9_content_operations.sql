-- Jarvis Phase 9: Content Operations Engine
-- Orchestration on marketing_content + calendar. Does not replace Instagram Graph publish.

ALTER TABLE public.marketing_content
  ADD COLUMN IF NOT EXISTS ops_state text,
  ADD COLUMN IF NOT EXISTS ops_priority integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS blocking_reason text,
  ADD COLUMN IF NOT EXISTS edl_id uuid,
  ADD COLUMN IF NOT EXISTS render_job_id uuid,
  ADD COLUMN IF NOT EXISTS opportunity_fingerprint text,
  ADD COLUMN IF NOT EXISTS publish_idempotency_key text,
  ADD COLUMN IF NOT EXISTS published_media_id text,
  ADD COLUMN IF NOT EXISTS published_permalink text,
  ADD COLUMN IF NOT EXISTS publish_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS measurement_status text
    CHECK (measurement_status IS NULL OR measurement_status IN (
      'none', 'pending', 'measuring', 'measured', 'unavailable', 'failed'
    )),
  ADD COLUMN IF NOT EXISTS approved_caption text,
  ADD COLUMN IF NOT EXISTS publish_package jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_mix_pillar text,
  ADD COLUMN IF NOT EXISTS user_priority integer,
  ADD COLUMN IF NOT EXISTS ops_updated_at timestamptz;

-- Expand status check to include ops-aligned values used by Phase 9
-- Keep existing statuses; ops_state is the operational lifecycle.

CREATE UNIQUE INDEX IF NOT EXISTS marketing_content_publish_idempotency_uidx
  ON public.marketing_content(publish_idempotency_key)
  WHERE publish_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_content_ops_state_idx
  ON public.marketing_content(ops_state, ops_priority DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS marketing_content_scheduled_for_idx
  ON public.marketing_content(scheduled_for)
  WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_content_published_media_idx
  ON public.marketing_content(published_media_id)
  WHERE published_media_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.jarvis_content_ops_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.marketing_content(id) ON DELETE CASCADE,
  previous_state text,
  new_state text NOT NULL,
  reason text,
  actor text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_content_ops_events_content_idx
  ON public.jarvis_content_ops_events(content_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_content_cadence_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'default',
  posts_per_week integer NOT NULL DEFAULT 3
    CHECK (posts_per_week >= 0 AND posts_per_week <= 21),
  mix jsonb NOT NULL DEFAULT '{"education":70,"authority":20,"promotion":10}'::jsonb,
  min_hours_between_similar_topics integer NOT NULL DEFAULT 72,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  preferred_hours integer[] NOT NULL DEFAULT '{19,20}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jarvis_content_batch_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'executed', 'cancelled')),
  window_start date,
  window_end date,
  cadence jsonb NOT NULL DEFAULT '{}'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text[] NOT NULL DEFAULT '{}',
  limitations text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jarvis_content_batch_fingerprint_idx
  ON public.jarvis_content_batch_proposals(fingerprint);

ALTER TABLE public.jarvis_creative_calendar
  ADD COLUMN IF NOT EXISTS planned_time time,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';

ALTER TABLE public.jarvis_content_ops_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_content_ops_events" ON public.jarvis_content_ops_events;
CREATE POLICY "Admins read jarvis_content_ops_events"
  ON public.jarvis_content_ops_events FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_content_ops_events" ON public.jarvis_content_ops_events;
CREATE POLICY "Admins write jarvis_content_ops_events"
  ON public.jarvis_content_ops_events FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_content_cadence_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_content_cadence_settings" ON public.jarvis_content_cadence_settings;
CREATE POLICY "Admins read jarvis_content_cadence_settings"
  ON public.jarvis_content_cadence_settings FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_content_cadence_settings" ON public.jarvis_content_cadence_settings;
CREATE POLICY "Admins write jarvis_content_cadence_settings"
  ON public.jarvis_content_cadence_settings FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_content_batch_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_content_batch_proposals" ON public.jarvis_content_batch_proposals;
CREATE POLICY "Admins read jarvis_content_batch_proposals"
  ON public.jarvis_content_batch_proposals FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_content_batch_proposals" ON public.jarvis_content_batch_proposals;
CREATE POLICY "Admins write jarvis_content_batch_proposals"
  ON public.jarvis_content_batch_proposals FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
