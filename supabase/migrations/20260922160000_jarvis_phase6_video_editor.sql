-- Jarvis Phase 6: AI Video Editor — durable EDL (canonical), Shotstack is execution only.
-- Does NOT replace video_edit_jobs; links renders to EDL versions.
-- Does NOT auto-publish to Instagram.

CREATE TABLE IF NOT EXISTS public.jarvis_video_edls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_content_id uuid REFERENCES public.marketing_content(id) ON DELETE SET NULL,
  creative_version integer,
  session_id uuid REFERENCES public.jarvis_video_sessions(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  parent_edl_id uuid REFERENCES public.jarvis_video_edls(id) ON DELETE SET NULL,
  title text,
  objective text,
  platform text NOT NULL DEFAULT 'instagram',
  format text NOT NULL DEFAULT 'reel',
  aspect_ratio text NOT NULL DEFAULT '9:16',
  target_duration_ms integer,
  estimated_duration_ms integer,
  -- Canonical EDL JSON (provider-agnostic). Never store Shotstack-only fields here.
  edl jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  unsupported_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_render_cost_usd numeric(12, 6),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN (
      'DRAFT',
      'VALIDATING',
      'READY_TO_RENDER',
      'PAUSED_BUDGET',
      'RENDERING',
      'RENDERED',
      'REVIEW',
      'REVISION_REQUESTED',
      'APPROVED',
      'REJECTED',
      'FAILED',
      'ARCHIVED',
      'MISSING_FOOTAGE'
    )),
  fingerprint text,
  revision_reason text,
  user_feedback text,
  changed_operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_video_edls_creative_idx
  ON public.jarvis_video_edls(creative_content_id, version DESC);
CREATE INDEX IF NOT EXISTS jarvis_video_edls_session_idx
  ON public.jarvis_video_edls(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_video_edls_parent_idx
  ON public.jarvis_video_edls(parent_edl_id);
CREATE INDEX IF NOT EXISTS jarvis_video_edls_status_idx
  ON public.jarvis_video_edls(status);
CREATE UNIQUE INDEX IF NOT EXISTS jarvis_video_edls_fingerprint_version_idx
  ON public.jarvis_video_edls(fingerprint, version)
  WHERE fingerprint IS NOT NULL;

ALTER TABLE public.jarvis_video_edls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_video_edls" ON public.jarvis_video_edls;
CREATE POLICY "Admins read jarvis_video_edls"
  ON public.jarvis_video_edls FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_video_edls" ON public.jarvis_video_edls;
CREATE POLICY "Admins write jarvis_video_edls"
  ON public.jarvis_video_edls FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Link render jobs to the EDL that produced them
ALTER TABLE public.video_edit_jobs
  ADD COLUMN IF NOT EXISTS edl_id uuid REFERENCES public.jarvis_video_edls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edl_version integer,
  ADD COLUMN IF NOT EXISTS render_idempotency_key text;

CREATE INDEX IF NOT EXISTS video_edit_jobs_edl_idx
  ON public.video_edit_jobs(edl_id);
CREATE UNIQUE INDEX IF NOT EXISTS video_edit_jobs_render_idempotency_idx
  ON public.video_edit_jobs(render_idempotency_key)
  WHERE render_idempotency_key IS NOT NULL;
