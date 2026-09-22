-- Jarvis Phase 7: Taste Engine
-- Structured creative preferences + evidence. Confirmed ACTIVE prefs sync to jarvis_memory
-- (USER_PREFERENCE) for Phase 3 retrieval — do not invent a parallel free-text preference store.

CREATE TABLE IF NOT EXISTS public.jarvis_taste_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'GLOBAL'
    CHECK (scope IN (
      'GLOBAL', 'INSTAGRAM_REEL', 'YOUTUBE_SHORT', 'FAT_LOSS', 'MUSCLE_GAIN',
      'EDUCATIONAL', 'TRANSFORMATION', 'PERSONAL_STORY', 'SALES', 'HOOK', 'CTA',
      'CREATIVE', 'SESSION', 'FUNNEL', 'CAMPAIGN', 'PLATFORM'
    )),
  scope_id text,
  dimension text NOT NULL
    CHECK (dimension IN (
      'HOOK', 'PACING', 'EDITING', 'CAPTIONS', 'TEXT', 'COLOR', 'FRAMING',
      'AUDIO', 'CTA', 'CONTENT'
    )),
  preference_key text NOT NULL,
  preference_value text NOT NULL,
  polarity text NOT NULL DEFAULT 'PREFER'
    CHECK (polarity IN ('PREFER', 'AVOID', 'INCREASE', 'DECREASE', 'NEUTRAL')),
  influence_mode text NOT NULL DEFAULT 'SOFT_PREFERENCE'
    CHECK (influence_mode IN (
      'HARD_CONSTRAINT', 'STRONG_PREFERENCE', 'SOFT_PREFERENCE', 'OBSERVATION'
    )),
  confidence numeric NOT NULL DEFAULT 0.2
    CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count integer NOT NULL DEFAULT 0,
  positive_evidence_count integer NOT NULL DEFAULT 0,
  negative_evidence_count integer NOT NULL DEFAULT 0,
  source_types text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'CANDIDATE'
    CHECK (status IN ('CANDIDATE', 'ACTIVE', 'CONFLICTED', 'STALE', 'REJECTED')),
  signal_kind text NOT NULL DEFAULT 'USER_TASTE'
    CHECK (signal_kind IN ('USER_TASTE', 'AUDIENCE_SIGNAL')),
  explanation text,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  memory_id uuid REFERENCES public.jarvis_memory(id) ON DELETE SET NULL,
  fingerprint text NOT NULL,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_taste_preferences_fingerprint_idx
  ON public.jarvis_taste_preferences(fingerprint);
CREATE INDEX IF NOT EXISTS jarvis_taste_preferences_status_idx
  ON public.jarvis_taste_preferences(status, confidence DESC);
CREATE INDEX IF NOT EXISTS jarvis_taste_preferences_dim_idx
  ON public.jarvis_taste_preferences(dimension, preference_key);
CREATE INDEX IF NOT EXISTS jarvis_taste_preferences_scope_idx
  ON public.jarvis_taste_preferences(scope, scope_id);

CREATE TABLE IF NOT EXISTS public.jarvis_taste_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preference_id uuid REFERENCES public.jarvis_taste_preferences(id) ON DELETE SET NULL,
  evidence_type text NOT NULL
    CHECK (evidence_type IN (
      'EXPLICIT_FEEDBACK', 'EDL_REVISION', 'RENDER_APPROVAL', 'RENDER_REJECTION',
      'CREATIVE_APPROVAL', 'CREATIVE_REJECTION', 'REPEATED_REVISION',
      'PERFORMANCE_SIGNAL', 'USER_INSTRUCTION', 'CONFIRMATION', 'REJECTION_OF_PREF'
    )),
  dimension text NOT NULL,
  preference_key text NOT NULL,
  signal text NOT NULL,
  direction text
    CHECK (direction IS NULL OR direction IN (
      'INCREASE', 'DECREASE', 'FASTER', 'SLOWER', 'POSITIVE', 'NEGATIVE',
      'PREFER', 'AVOID', 'NEUTRAL'
    )),
  confidence numeric NOT NULL DEFAULT 0.3
    CHECK (confidence >= 0 AND confidence <= 1),
  signal_kind text NOT NULL DEFAULT 'USER_TASTE'
    CHECK (signal_kind IN ('USER_TASTE', 'AUDIENCE_SIGNAL')),
  scope text NOT NULL DEFAULT 'GLOBAL',
  scope_id text,
  creative_content_id uuid,
  edl_id uuid REFERENCES public.jarvis_video_edls(id) ON DELETE SET NULL,
  edl_version integer,
  render_job_id uuid,
  feedback_text text,
  diff_summary text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_taste_evidence_fingerprint_idx
  ON public.jarvis_taste_evidence(fingerprint);
CREATE INDEX IF NOT EXISTS jarvis_taste_evidence_pref_idx
  ON public.jarvis_taste_evidence(preference_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_taste_evidence_dim_idx
  ON public.jarvis_taste_evidence(dimension, preference_key, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_taste_evidence_edl_idx
  ON public.jarvis_taste_evidence(edl_id);

ALTER TABLE public.jarvis_taste_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_taste_preferences" ON public.jarvis_taste_preferences;
CREATE POLICY "Admins read jarvis_taste_preferences"
  ON public.jarvis_taste_preferences FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_taste_preferences" ON public.jarvis_taste_preferences;
CREATE POLICY "Admins write jarvis_taste_preferences"
  ON public.jarvis_taste_preferences FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_taste_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_taste_evidence" ON public.jarvis_taste_evidence;
CREATE POLICY "Admins read jarvis_taste_evidence"
  ON public.jarvis_taste_evidence FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_taste_evidence" ON public.jarvis_taste_evidence;
CREATE POLICY "Admins write jarvis_taste_evidence"
  ON public.jarvis_taste_evidence FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
