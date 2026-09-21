-- LURVOX AI Marketing Operating System
-- Admin-only marketing data. Service role writes from server routes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Settings (key/value JSON)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Creatives
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'static'
    CHECK (type IN ('static', 'ugc', 'video', 'carousel', 'story')),
  concept text,
  angle text,
  hook text,
  headline text,
  primary_text text,
  description text,
  cta text,
  visual_direction text,
  image_generation_prompt text,
  image_url text,
  video_url text,
  target_audience text,
  hypothesis text,
  expected_test_reason text,
  parent_creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  meta_creative_id text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'generated', 'approved', 'rejected', 'ready_for_meta',
      'in_test', 'winner', 'loser', 'retired', 'archived'
    )),
  source text NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai', 'human', 'imported', 'variation')),
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_creatives_status_idx ON public.marketing_creatives(status);
CREATE INDEX IF NOT EXISTS marketing_creatives_type_idx ON public.marketing_creatives(type);
CREATE INDEX IF NOT EXISTS marketing_creatives_created_at_idx ON public.marketing_creatives(created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_creatives_parent_idx ON public.marketing_creatives(parent_creative_id);

-- ---------------------------------------------------------------------------
-- Campaigns / Ad sets / Ads (normalized Meta mirror + local drafts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_campaign_id text UNIQUE,
  ad_account_id text,
  name text NOT NULL,
  objective text,
  status text NOT NULL DEFAULT 'PAUSED',
  daily_budget_cents integer,
  lifetime_budget_cents integer,
  currency text NOT NULL DEFAULT 'INR',
  source text NOT NULL DEFAULT 'local'
    CHECK (source IN ('local', 'meta_sync', 'ai')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_campaigns_status_idx ON public.marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS marketing_campaigns_meta_id_idx ON public.marketing_campaigns(meta_campaign_id);

CREATE TABLE IF NOT EXISTS public.marketing_adsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  meta_adset_id text UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'PAUSED',
  daily_budget_cents integer,
  lifetime_budget_cents integer,
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  optimization_goal text,
  billing_event text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_adsets_campaign_idx ON public.marketing_adsets(campaign_id);
CREATE INDEX IF NOT EXISTS marketing_adsets_meta_id_idx ON public.marketing_adsets(meta_adset_id);

CREATE TABLE IF NOT EXISTS public.marketing_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adset_id uuid REFERENCES public.marketing_adsets(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  meta_ad_id text UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'PAUSED',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_ads_adset_idx ON public.marketing_ads(adset_id);
CREATE INDEX IF NOT EXISTS marketing_ads_creative_idx ON public.marketing_ads(creative_id);
CREATE INDEX IF NOT EXISTS marketing_ads_meta_id_idx ON public.marketing_ads(meta_ad_id);

-- ---------------------------------------------------------------------------
-- Performance (daily grains)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  ad_account_id text,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  adset_id uuid REFERENCES public.marketing_adsets(id) ON DELETE SET NULL,
  ad_id uuid REFERENCES public.marketing_ads(id) ON DELETE SET NULL,
  creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  spend numeric(14, 4) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  reach bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  ctr numeric(10, 6),
  cpc numeric(14, 4),
  cpm numeric(14, 4),
  frequency numeric(10, 4),
  purchases numeric(14, 4) NOT NULL DEFAULT 0,
  revenue numeric(14, 4) NOT NULL DEFAULT 0,
  cpa numeric(14, 4),
  roas numeric(14, 4),
  conversions numeric(14, 4) NOT NULL DEFAULT 0,
  conversion_value numeric(14, 4) NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (date, meta_campaign_id, meta_adset_id, meta_ad_id)
);

CREATE INDEX IF NOT EXISTS marketing_performance_date_idx ON public.marketing_performance(date DESC);
CREATE INDEX IF NOT EXISTS marketing_performance_campaign_idx ON public.marketing_performance(campaign_id);
CREATE INDEX IF NOT EXISTS marketing_performance_ad_idx ON public.marketing_performance(ad_id);
CREATE INDEX IF NOT EXISTS marketing_performance_creative_idx ON public.marketing_performance(creative_id);

-- ---------------------------------------------------------------------------
-- Experiments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hypothesis text NOT NULL,
  variable text NOT NULL,
  control_description text,
  treatment_description text,
  control_creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  treatment_creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  budget_cents integer,
  success_metric text NOT NULL DEFAULT 'cpa',
  minimum_spend numeric(14, 4) NOT NULL DEFAULT 0,
  minimum_purchases numeric(14, 4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_conclusion text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_experiments_status_idx ON public.marketing_experiments(status);

-- ---------------------------------------------------------------------------
-- AI decisions & actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_ai_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  entity_type text,
  entity_id text,
  decision text NOT NULL,
  reasoning text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(5, 4),
  recommended_action text,
  risk_level text NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  estimated_impact text,
  autonomy_level integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'cancelled', 'superseded')),
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS marketing_ai_decisions_status_idx ON public.marketing_ai_decisions(status);
CREATE INDEX IF NOT EXISTS marketing_ai_decisions_created_at_idx ON public.marketing_ai_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_ai_decisions_agent_idx ON public.marketing_ai_decisions(agent);

CREATE TABLE IF NOT EXISTS public.marketing_ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid REFERENCES public.marketing_ai_decisions(id) ON DELETE SET NULL,
  action_type text NOT NULL
    CHECK (action_type IN (
      'PAUSE_AD', 'RESUME_AD', 'INCREASE_BUDGET', 'DECREASE_BUDGET',
      'KEEP_RUNNING', 'CREATE_NEW_CREATIVE', 'CREATE_NEW_TEST',
      'INVESTIGATE_FUNNEL', 'NO_ACTION', 'SYNC_META', 'CREATE_CAMPAIGN',
      'CREATE_ADSET', 'CREATE_AD', 'CREATE_CREATIVE', 'UPDATE_AD',
      'UPDATE_CAMPAIGN', 'UPDATE_ADSET', 'GENERATE_VARIATIONS',
      'LAUNCH_EXPERIMENT', 'NOTIFY'
    )),
  target_type text,
  target_id text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'auto_approved', 'blocked')),
  autonomy_level integer NOT NULL DEFAULT 2,
  idempotency_key text UNIQUE,
  risk_level text NOT NULL DEFAULT 'medium',
  guardrail_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz,
  execution_result jsonb,
  error text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_ai_actions_approval_idx ON public.marketing_ai_actions(approval_status);
CREATE INDEX IF NOT EXISTS marketing_ai_actions_type_idx ON public.marketing_ai_actions(action_type);
CREATE INDEX IF NOT EXISTS marketing_ai_actions_created_at_idx ON public.marketing_ai_actions(created_at DESC);

-- ---------------------------------------------------------------------------
-- Instagram / organic content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'instagram'
    CHECK (platform IN ('instagram', 'facebook', 'youtube', 'other')),
  content_type text NOT NULL DEFAULT 'reel'
    CHECK (content_type IN ('reel', 'carousel', 'story', 'post', 'idea')),
  topic text,
  hook text,
  script text,
  caption text,
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  hashtags jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta text,
  content_category text,
  reason text,
  scheduled_for timestamptz,
  posted_at timestamptz,
  views bigint,
  reach bigint,
  watch_time_seconds numeric(14, 2),
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  followers_gained integer,
  status text NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'draft', 'scheduled', 'posted', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_content_status_idx ON public.marketing_content(status);
CREATE INDEX IF NOT EXISTS marketing_content_scheduled_idx ON public.marketing_content(scheduled_for);

-- ---------------------------------------------------------------------------
-- Generation jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL
    CHECK (job_type IN (
      'static_creatives', 'creative_variations', 'ugc_scripts',
      'instagram_ideas', 'image_generation', 'analysis', 'funnel_report'
    )),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS marketing_generation_jobs_status_idx ON public.marketing_generation_jobs(status);
CREATE INDEX IF NOT EXISTS marketing_generation_jobs_created_at_idx ON public.marketing_generation_jobs(created_at DESC);

-- ---------------------------------------------------------------------------
-- Video edit jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_edit_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_video text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'review_required')),
  transcript text,
  edit_instructions jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_video text,
  provider text NOT NULL DEFAULT 'stub',
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS video_edit_jobs_status_idx ON public.video_edit_jobs(status);
CREATE INDEX IF NOT EXISTS video_edit_jobs_created_at_idx ON public.video_edit_jobs(created_at DESC);

-- ---------------------------------------------------------------------------
-- Funnel snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_funnel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  ad_clicks bigint NOT NULL DEFAULT 0,
  landing_views bigint NOT NULL DEFAULT 0,
  checkout_starts bigint NOT NULL DEFAULT 0,
  purchases bigint NOT NULL DEFAULT 0,
  onboarding_started bigint NOT NULL DEFAULT 0,
  onboarding_completed bigint NOT NULL DEFAULT 0,
  plans_delivered bigint NOT NULL DEFAULT 0,
  renewals bigint NOT NULL DEFAULT 0,
  spend numeric(14, 4) NOT NULL DEFAULT 0,
  revenue numeric(14, 4) NOT NULL DEFAULT 0,
  aov numeric(14, 4),
  cpa numeric(14, 4),
  roas numeric(14, 4),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date)
);

-- ---------------------------------------------------------------------------
-- Marketing audit trail (complete AI/API traceability)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  agent text NOT NULL,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text,
  reasoning text,
  confidence numeric(5, 4),
  action text,
  autonomy_level integer,
  approval text,
  execution_result jsonb,
  error text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  related_decision_id uuid REFERENCES public.marketing_ai_decisions(id) ON DELETE SET NULL,
  related_action_id uuid REFERENCES public.marketing_ai_actions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS marketing_audit_events_timestamp_idx ON public.marketing_audit_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS marketing_audit_events_agent_idx ON public.marketing_audit_events(agent);

-- ---------------------------------------------------------------------------
-- Storage bucket for marketing creatives (private; admin/service access)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-creatives',
  'marketing-creatives',
  false,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS — admin read; service role writes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_settings',
    'marketing_creatives',
    'marketing_campaigns',
    'marketing_adsets',
    'marketing_ads',
    'marketing_performance',
    'marketing_experiments',
    'marketing_ai_decisions',
    'marketing_ai_actions',
    'marketing_content',
    'marketing_generation_jobs',
    'video_edit_jobs',
    'marketing_funnel_snapshots',
    'marketing_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Admins read %s" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin())',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS "Admins write %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Admins write %s" ON public.%I FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin())',
      t, t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admins read marketing creatives storage" ON storage.objects;
CREATE POLICY "Admins read marketing creatives storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-creatives' AND public.is_platform_admin());

DROP POLICY IF EXISTS "Admins write marketing creatives storage" ON storage.objects;
CREATE POLICY "Admins write marketing creatives storage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'marketing-creatives' AND public.is_platform_admin())
  WITH CHECK (bucket_id = 'marketing-creatives' AND public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Seed default settings
-- ---------------------------------------------------------------------------
INSERT INTO public.marketing_settings (key, value) VALUES
  ('MARKETING_AUTONOMY_LEVEL', '2'::jsonb),
  ('guardrails', jsonb_build_object(
    'MIN_SPEND_BEFORE_PAUSE', 1500,
    'MIN_PURCHASES_FOR_WINNER', 3,
    'MIN_DATA_BEFORE_PAUSE', 1500,
    'TARGET_CPA', 2500,
    'TARGET_ROAS', 2.0,
    'MAX_DAILY_ACCOUNT_SPEND', 25000,
    'MAX_BUDGET_INCREASE_PERCENT', 20,
    'MAX_BUDGET_DECREASE_PERCENT', 50,
    'MAX_SINGLE_ACTION_SPEND', 10000,
    'MAX_SINGLE_TEST_SPEND', 5000,
    'CREATIVE_FATIGUE_THRESHOLD', 2.5,
    'MIN_DATA_WINDOW_DAYS', 3,
    'currency', 'INR'
  )),
  ('brand', jsonb_build_object(
    'name', 'LURVOX',
    'tagline', 'Personal coaching that transforms',
    'products', jsonb_build_array(
      jsonb_build_object('id', 'coaching_3m', 'name', '3-Month Coaching', 'category', 'coaching'),
      jsonb_build_object('id', 'coaching_6m', 'name', '6-Month Coaching', 'category', 'coaching'),
      jsonb_build_object('id', 'coaching_12m', 'name', '12-Month Coaching', 'category', 'coaching')
    ),
    'primary_audiences', jsonb_build_array(
      'Busy professionals who want fat loss with structure',
      'Beginners who feel lost in the gym',
      'People restarting after inconsistency'
    ),
    'offers', jsonb_build_array(
      'Personal coaching with weekly check-ins',
      'Custom diet + workout plans',
      'Coach accountability'
    ),
    'website', 'https://www.lurvox.in'
  )),
  ('meta_integration', jsonb_build_object(
    'configured', false,
    'last_sync_at', null,
    'last_sync_error', null
  ))
ON CONFLICT (key) DO NOTHING;
