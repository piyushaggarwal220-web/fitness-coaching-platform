-- Content states for Instagram planning + video source registry for Jarvis.
-- Extends marketing_content statuses; adds private video source refs (no public URLs).

-- marketing_content: add approved / rejected (published maps to existing 'posted')
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
  CHECK (status IN ('idea', 'draft', 'approved', 'scheduled', 'posted', 'rejected', 'archived'));

CREATE TABLE IF NOT EXISTS public.jarvis_video_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Opaque internal reference shown to tools/UI — never a filesystem path
  source_ref text NOT NULL UNIQUE,
  original_filename text,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  -- Private storage path (service-role only); never return raw to frontend
  storage_path text NOT NULL,
  duration_sec numeric,
  width integer,
  height integer,
  checksum_sha256 text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS jarvis_video_sources_created_idx
  ON public.jarvis_video_sources(created_at DESC);

ALTER TABLE public.jarvis_video_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read jarvis_video_sources" ON public.jarvis_video_sources;
CREATE POLICY "Admins read jarvis_video_sources"
  ON public.jarvis_video_sources FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_video_sources" ON public.jarvis_video_sources;
CREATE POLICY "Admins write jarvis_video_sources"
  ON public.jarvis_video_sources FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- Optional columns on video_edit_jobs for richer editing metadata
ALTER TABLE public.video_edit_jobs
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS preset text,
  ADD COLUMN IF NOT EXISTS aspect_ratio text,
  ADD COLUMN IF NOT EXISTS duration_target_sec numeric,
  ADD COLUMN IF NOT EXISTS crop_strategy text,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS actual_cost_usd numeric;

ALTER TABLE public.video_edit_jobs DROP CONSTRAINT IF EXISTS video_edit_jobs_status_check;
ALTER TABLE public.video_edit_jobs
  ADD CONSTRAINT video_edit_jobs_status_check
  CHECK (status IN (
    'queued',
    'analyzing',
    'editing',
    'rendering',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'paused_budget',
    'review_required',
    'awaiting_approval'
  ));

-- Private storage bucket for Jarvis video sources (no public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'jarvis-video-sources',
  'jarvis-video-sources',
  false,
  209715200,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 209715200,
  allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm'];
