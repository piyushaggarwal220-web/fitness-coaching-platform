-- Jarvis Phase 4: Video Intelligence
-- Sessions, analysis runs, transcripts, segments, opportunities.
-- Extends jarvis_video_sources; does NOT replace video_edit_jobs (render path).

CREATE TABLE IF NOT EXISTS public.jarvis_video_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  source_count integer NOT NULL DEFAULT 0,
  total_duration_sec numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open', 'validating', 'analyzing', 'analyzed', 'partial',
      'failed', 'cancelled', 'paused_budget'
    )),
  opportunity_count integer NOT NULL DEFAULT 0,
  analysis_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_video_sessions_created_idx
  ON public.jarvis_video_sessions(created_at DESC);

ALTER TABLE public.jarvis_video_sources
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.jarvis_video_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fps numeric,
  ADD COLUMN IF NOT EXISTS aspect_ratio text,
  ADD COLUMN IF NOT EXISTS orientation text,
  ADD COLUMN IF NOT EXISTS has_audio boolean,
  ADD COLUMN IF NOT EXISTS audio_channels integer,
  ADD COLUMN IF NOT EXISTS sample_rate integer,
  ADD COLUMN IF NOT EXISTS video_codec text,
  ADD COLUMN IF NOT EXISTS audio_codec text,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN IF NOT EXISTS analysis_status text NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS transcription_status text NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.jarvis_video_sources
    ADD CONSTRAINT jarvis_video_sources_processing_status_check
    CHECK (processing_status IN (
      'UPLOADED', 'VALIDATING', 'VALID', 'INVALID',
      'ANALYZING', 'ANALYZED', 'FAILED', 'CANCELLED'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.jarvis_video_sources
    ADD CONSTRAINT jarvis_video_sources_analysis_status_check
    CHECK (analysis_status IN (
      'NOT_STARTED', 'QUEUED', 'RUNNING', 'COMPLETED',
      'FAILED', 'UNSUPPORTED', 'CANCELLED', 'PAUSED_BUDGET'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.jarvis_video_sources
    ADD CONSTRAINT jarvis_video_sources_transcription_status_check
    CHECK (transcription_status IN (
      'NOT_STARTED', 'QUEUED', 'PROCESSING', 'COMPLETED',
      'FAILED', 'UNAVAILABLE', 'UNSUPPORTED', 'CANCELLED'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS jarvis_video_sources_session_idx
  ON public.jarvis_video_sources(session_id);
CREATE INDEX IF NOT EXISTS jarvis_video_sources_checksum_idx
  ON public.jarvis_video_sources(checksum_sha256);

CREATE TABLE IF NOT EXISTS public.jarvis_video_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.jarvis_video_sessions(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.jarvis_video_sources(id) ON DELETE CASCADE,
  -- Idempotent step key: source_id + stage + config_hash
  step_key text NOT NULL UNIQUE,
  stage text NOT NULL
    CHECK (stage IN (
      'VALIDATE', 'METADATA', 'AUDIO', 'TRANSCRIPTION',
      'SEGMENTS', 'CLASSIFICATION', 'QUALITY', 'INDEX', 'OPPORTUNITIES'
    )),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'PENDING', 'QUEUED', 'RUNNING', 'COMPLETED',
      'FAILED', 'UNSUPPORTED', 'CANCELLED', 'PAUSED_BUDGET'
    )),
  provider text,
  config_hash text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  error_code text,
  cost_usd numeric NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_video_analysis_runs_source_idx
  ON public.jarvis_video_analysis_runs(source_id, stage);
CREATE INDEX IF NOT EXISTS jarvis_video_analysis_runs_session_idx
  ON public.jarvis_video_analysis_runs(session_id, status);

CREATE TABLE IF NOT EXISTS public.jarvis_video_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.jarvis_video_sources(id) ON DELETE CASCADE,
  provider text NOT NULL,
  language text,
  language_confidence numeric,
  full_text text NOT NULL DEFAULT '',
  -- Structured segments: [{start, end, text, confidence?}]
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Optional word-level: [{start, end, word, confidence?}] — may be empty
  words jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN (
      'NOT_STARTED', 'QUEUED', 'PROCESSING', 'COMPLETED',
      'FAILED', 'UNAVAILABLE', 'UNSUPPORTED'
    )),
  confidence text CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, provider)
);
CREATE INDEX IF NOT EXISTS jarvis_video_transcripts_source_idx
  ON public.jarvis_video_transcripts(source_id);

CREATE TABLE IF NOT EXISTS public.jarvis_video_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.jarvis_video_sources(id) ON DELETE CASCADE,
  start_time numeric NOT NULL,
  end_time numeric NOT NULL,
  duration numeric NOT NULL,
  segment_type text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (segment_type IN (
      'SPEECH', 'SILENCE', 'HOOK', 'EXPLANATION', 'CTA', 'STORY',
      'DEMONSTRATION', 'B_ROLL', 'TRANSITION', 'REACTION',
      'INTRO', 'OUTRO', 'FILLER', 'UNKNOWN'
    )),
  classification_label text,
  transcript_excerpt text,
  transcript_id uuid REFERENCES public.jarvis_video_transcripts(id) ON DELETE SET NULL,
  confidence text CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'INVALID')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS jarvis_video_segments_source_idx
  ON public.jarvis_video_segments(source_id, start_time);
CREATE INDEX IF NOT EXISTS jarvis_video_segments_type_idx
  ON public.jarvis_video_segments(segment_type);
CREATE INDEX IF NOT EXISTS jarvis_video_segments_label_idx
  ON public.jarvis_video_segments(classification_label);

CREATE TABLE IF NOT EXISTS public.jarvis_video_take_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.jarvis_video_sessions(id) ON DELETE CASCADE,
  similarity numeric,
  confidence text CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  similarity_basis text NOT NULL DEFAULT 'transcript'
    CHECK (similarity_basis IN ('exact_hash', 'transcript', 'audio', 'visual', 'mixed')),
  source_ids uuid[] NOT NULL DEFAULT '{}',
  segment_ids uuid[] NOT NULL DEFAULT '{}',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_video_take_groups_session_idx
  ON public.jarvis_video_take_groups(session_id);

CREATE TABLE IF NOT EXISTS public.jarvis_video_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.jarvis_video_sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  concept text,
  hook text,
  audience text,
  objective text,
  estimated_duration_sec numeric,
  -- Exact source mapping for future EDL:
  -- [{source_id, start, end, role}]
  source_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_material text[] NOT NULL DEFAULT '{}',
  confidence text NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'accepted', 'rejected', 'superseded', 'archived')),
  dedupe_key text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jarvis_video_opportunities_dedupe_idx
  ON public.jarvis_video_opportunities(session_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jarvis_video_opportunities_session_idx
  ON public.jarvis_video_opportunities(session_id, created_at DESC);

-- RLS
ALTER TABLE public.jarvis_video_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_video_sessions" ON public.jarvis_video_sessions;
CREATE POLICY "Admins read jarvis_video_sessions"
  ON public.jarvis_video_sessions FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_video_sessions" ON public.jarvis_video_sessions;
CREATE POLICY "Admins write jarvis_video_sessions"
  ON public.jarvis_video_sessions FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_video_analysis_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_video_analysis_runs" ON public.jarvis_video_analysis_runs;
CREATE POLICY "Admins read jarvis_video_analysis_runs"
  ON public.jarvis_video_analysis_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_video_analysis_runs" ON public.jarvis_video_analysis_runs;
CREATE POLICY "Admins write jarvis_video_analysis_runs"
  ON public.jarvis_video_analysis_runs FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_video_transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_video_transcripts" ON public.jarvis_video_transcripts;
CREATE POLICY "Admins read jarvis_video_transcripts"
  ON public.jarvis_video_transcripts FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_video_transcripts" ON public.jarvis_video_transcripts;
CREATE POLICY "Admins write jarvis_video_transcripts"
  ON public.jarvis_video_transcripts FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_video_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_video_segments" ON public.jarvis_video_segments;
CREATE POLICY "Admins read jarvis_video_segments"
  ON public.jarvis_video_segments FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_video_segments" ON public.jarvis_video_segments;
CREATE POLICY "Admins write jarvis_video_segments"
  ON public.jarvis_video_segments FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_video_take_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_video_take_groups" ON public.jarvis_video_take_groups;
CREATE POLICY "Admins read jarvis_video_take_groups"
  ON public.jarvis_video_take_groups FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_video_take_groups" ON public.jarvis_video_take_groups;
CREATE POLICY "Admins write jarvis_video_take_groups"
  ON public.jarvis_video_take_groups FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_video_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_video_opportunities" ON public.jarvis_video_opportunities;
CREATE POLICY "Admins read jarvis_video_opportunities"
  ON public.jarvis_video_opportunities FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_video_opportunities" ON public.jarvis_video_opportunities;
CREATE POLICY "Admins write jarvis_video_opportunities"
  ON public.jarvis_video_opportunities FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
