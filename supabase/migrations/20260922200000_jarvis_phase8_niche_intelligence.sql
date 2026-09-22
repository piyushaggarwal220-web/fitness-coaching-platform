-- Jarvis Phase 8: Fitness Niche / Instagram Content Intelligence
-- External research layer (WEB_RESEARCH via Brave). Does NOT duplicate
-- marketing_instagram_media (own-account Graph SoT).

CREATE TABLE IF NOT EXISTS public.jarvis_instagram_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  creators text[] NOT NULL DEFAULT '{}',
  niches text[] NOT NULL DEFAULT '{}',
  topics text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  geographies text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jarvis_instagram_viral_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  creator_handle text,
  creator_profile_url text,
  source_url text NOT NULL,
  content_url text,
  title text,
  caption text,
  published_at timestamptz,
  observed_views text NOT NULL DEFAULT 'UNAVAILABLE',
  observed_likes text NOT NULL DEFAULT 'UNAVAILABLE',
  observed_comments text NOT NULL DEFAULT 'UNAVAILABLE',
  content_type text NOT NULL DEFAULT 'reel',
  topic text,
  hook text,
  format text,
  duration_sec numeric,
  niche text,
  geography text NOT NULL DEFAULT 'GLOBAL'
    CHECK (geography IN ('INDIA', 'GLOBAL', 'OTHER_REGION', 'UNKNOWN')),
  discovery_method text NOT NULL DEFAULT 'WEB_RESEARCH'
    CHECK (discovery_method IN (
      'WEB_RESEARCH', 'INSTAGRAM_GRAPH_API', 'USER_PROVIDED', 'WATCHLIST', 'CACHE'
    )),
  virality_basis text[] NOT NULL DEFAULT '{}',
  confidence numeric NOT NULL DEFAULT 0.3
    CHECK (confidence >= 0 AND confidence <= 1),
  limitations text[] NOT NULL DEFAULT '{}',
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  research_id uuid REFERENCES public.jarvis_research(id) ON DELETE SET NULL,
  observation_window text,
  source_name text,
  source_type text NOT NULL DEFAULT 'SECONDARY'
    CHECK (source_type IN (
      'PRIMARY', 'PLATFORM', 'CREATOR', 'NEWS', 'RESEARCH', 'COMMUNITY', 'SECONDARY'
    )),
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_ig_viral_reels_fingerprint_idx
  ON public.jarvis_instagram_viral_reels(fingerprint);
CREATE INDEX IF NOT EXISTS jarvis_ig_viral_reels_topic_idx
  ON public.jarvis_instagram_viral_reels(topic, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_ig_viral_reels_geo_idx
  ON public.jarvis_instagram_viral_reels(geography, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_instagram_creator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  handle text NOT NULL,
  profile_url text,
  platform text NOT NULL DEFAULT 'instagram',
  niche text,
  geography text NOT NULL DEFAULT 'UNKNOWN',
  follower_count text NOT NULL DEFAULT 'UNAVAILABLE',
  observed_posting_frequency text,
  recent_content_count integer,
  content_pillars text[] NOT NULL DEFAULT '{}',
  formats text[] NOT NULL DEFAULT '{}',
  recurring_hooks text[] NOT NULL DEFAULT '{}',
  cta_patterns text[] NOT NULL DEFAULT '{}',
  visible_engagement text NOT NULL DEFAULT 'UNAVAILABLE',
  notable_patterns text[] NOT NULL DEFAULT '{}',
  sample_size integer NOT NULL DEFAULT 0,
  observation_window text,
  data_available text[] NOT NULL DEFAULT '{}',
  data_unavailable text[] NOT NULL DEFAULT '{}',
  limitations text[] NOT NULL DEFAULT '{}',
  discovery_method text NOT NULL DEFAULT 'WEB_RESEARCH',
  research_id uuid REFERENCES public.jarvis_research(id) ON DELETE SET NULL,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_ig_creator_profiles_fingerprint_idx
  ON public.jarvis_instagram_creator_profiles(fingerprint);
CREATE INDEX IF NOT EXISTS jarvis_ig_creator_handle_idx
  ON public.jarvis_instagram_creator_profiles(handle);

CREATE TABLE IF NOT EXISTS public.jarvis_instagram_trend_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  scope text NOT NULL,
  geography text NOT NULL DEFAULT 'GLOBAL',
  niche text NOT NULL DEFAULT 'GENERAL_FITNESS',
  observation_window text NOT NULL,
  window_hours integer NOT NULL DEFAULT 168,
  creators_analyzed integer NOT NULL DEFAULT 0,
  reels_analyzed integer NOT NULL DEFAULT 0,
  top_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  hook_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  format_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  repetition_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  emerging_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  uncertain_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  claim_kind text NOT NULL DEFAULT 'OBSERVED_PATTERN'
    CHECK (claim_kind IN ('OBSERVED_PATTERN', 'INFERENCE', 'RECOMMENDATION')),
  discovery_method text NOT NULL DEFAULT 'WEB_RESEARCH',
  research_id uuid REFERENCES public.jarvis_research(id) ON DELETE SET NULL,
  limitations text[] NOT NULL DEFAULT '{}',
  spent_usd numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_ig_trend_reports_fingerprint_idx
  ON public.jarvis_instagram_trend_reports(fingerprint);
CREATE INDEX IF NOT EXISTS jarvis_ig_trend_reports_created_idx
  ON public.jarvis_instagram_trend_reports(created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_instagram_content_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  title text NOT NULL,
  observed text[] NOT NULL DEFAULT '{}',
  audience_signal text[] NOT NULL DEFAULT '{}',
  taste_notes text[] NOT NULL DEFAULT '{}',
  footage_notes text[] NOT NULL DEFAULT '{}',
  missing_footage text[] NOT NULL DEFAULT '{}',
  business_alignment text,
  trend_relevance text,
  originality_angles text[] NOT NULL DEFAULT '{}',
  fit_level text NOT NULL DEFAULT 'MEDIUM_FIT'
    CHECK (fit_level IN ('HIGH_FIT', 'MEDIUM_FIT', 'LOW_FIT')),
  scoring jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations text[] NOT NULL DEFAULT '{}',
  geography text,
  niche text,
  trend_report_id uuid REFERENCES public.jarvis_instagram_trend_reports(id) ON DELETE SET NULL,
  viral_reel_ids uuid[] NOT NULL DEFAULT '{}',
  creative_content_id uuid,
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'selected', 'handed_off', 'dismissed', 'archived')),
  claim_separation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_ig_content_opps_fingerprint_idx
  ON public.jarvis_instagram_content_opportunities(fingerprint);
CREATE INDEX IF NOT EXISTS jarvis_ig_content_opps_status_idx
  ON public.jarvis_instagram_content_opportunities(status, created_at DESC);

-- RLS
ALTER TABLE public.jarvis_instagram_watchlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_instagram_watchlists" ON public.jarvis_instagram_watchlists;
CREATE POLICY "Admins read jarvis_instagram_watchlists"
  ON public.jarvis_instagram_watchlists FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_instagram_watchlists" ON public.jarvis_instagram_watchlists;
CREATE POLICY "Admins write jarvis_instagram_watchlists"
  ON public.jarvis_instagram_watchlists FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_instagram_viral_reels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_instagram_viral_reels" ON public.jarvis_instagram_viral_reels;
CREATE POLICY "Admins read jarvis_instagram_viral_reels"
  ON public.jarvis_instagram_viral_reels FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_instagram_viral_reels" ON public.jarvis_instagram_viral_reels;
CREATE POLICY "Admins write jarvis_instagram_viral_reels"
  ON public.jarvis_instagram_viral_reels FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_instagram_creator_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_instagram_creator_profiles" ON public.jarvis_instagram_creator_profiles;
CREATE POLICY "Admins read jarvis_instagram_creator_profiles"
  ON public.jarvis_instagram_creator_profiles FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_instagram_creator_profiles" ON public.jarvis_instagram_creator_profiles;
CREATE POLICY "Admins write jarvis_instagram_creator_profiles"
  ON public.jarvis_instagram_creator_profiles FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_instagram_trend_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_instagram_trend_reports" ON public.jarvis_instagram_trend_reports;
CREATE POLICY "Admins read jarvis_instagram_trend_reports"
  ON public.jarvis_instagram_trend_reports FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_instagram_trend_reports" ON public.jarvis_instagram_trend_reports;
CREATE POLICY "Admins write jarvis_instagram_trend_reports"
  ON public.jarvis_instagram_trend_reports FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_instagram_content_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_instagram_content_opportunities" ON public.jarvis_instagram_content_opportunities;
CREATE POLICY "Admins read jarvis_instagram_content_opportunities"
  ON public.jarvis_instagram_content_opportunities FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_instagram_content_opportunities" ON public.jarvis_instagram_content_opportunities;
CREATE POLICY "Admins write jarvis_instagram_content_opportunities"
  ON public.jarvis_instagram_content_opportunities FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
