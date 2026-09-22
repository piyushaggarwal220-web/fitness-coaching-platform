-- Jarvis Phase 5: Creative Director
-- Extends marketing_content for footage-backed creative plans + versioning.
-- Does NOT replace Instagram planner; does NOT create video_edit_jobs / EDL / render.

DO $$
BEGIN
  ALTER TABLE public.marketing_content DROP CONSTRAINT IF EXISTS marketing_content_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.marketing_content
  DROP CONSTRAINT IF EXISTS marketing_content_status_check;

ALTER TABLE public.marketing_content
  ADD CONSTRAINT marketing_content_status_check
  CHECK (status IN (
    'idea',
    'draft',
    'review',
    'approved',
    'rejected',
    'revision_requested',
    'ready_for_edit',
    'scheduled',
    'posted',
    'archived'
  ));

ALTER TABLE public.marketing_content
  ADD COLUMN IF NOT EXISTS parent_content_id uuid REFERENCES public.marketing_content(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS video_session_id uuid REFERENCES public.jarvis_video_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS video_opportunity_id uuid REFERENCES public.jarvis_video_opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concept_fingerprint text,
  ADD COLUMN IF NOT EXISTS creative_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS feedback_log jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS marketing_content_parent_idx
  ON public.marketing_content(parent_content_id);
CREATE INDEX IF NOT EXISTS marketing_content_session_idx
  ON public.marketing_content(video_session_id);
CREATE INDEX IF NOT EXISTS marketing_content_fingerprint_idx
  ON public.marketing_content(concept_fingerprint)
  WHERE concept_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_content_creative_status_idx
  ON public.marketing_content(status)
  WHERE creative_plan <> '{}'::jsonb;

-- Lightweight calendar / schedule intent (not publishing)
CREATE TABLE IF NOT EXISTS public.jarvis_creative_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.marketing_content(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  pillar text,
  objective text,
  format text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'moved', 'cancelled', 'completed')),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, planned_date)
);

CREATE INDEX IF NOT EXISTS jarvis_creative_calendar_date_idx
  ON public.jarvis_creative_calendar(planned_date);

ALTER TABLE public.jarvis_creative_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read jarvis_creative_calendar" ON public.jarvis_creative_calendar;
CREATE POLICY "Admins read jarvis_creative_calendar"
  ON public.jarvis_creative_calendar FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins write jarvis_creative_calendar" ON public.jarvis_creative_calendar;
CREATE POLICY "Admins write jarvis_creative_calendar"
  ON public.jarvis_creative_calendar FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
