-- Multi-funnel economics for LURVOX AI Marketing OS
-- Independent offer models (₹99 vs ₹1,699). Extensible for more funnels.

CREATE TABLE IF NOT EXISTS public.marketing_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  offer text NOT NULL,
  product text NOT NULL,
  price_inr numeric(14, 2) NOT NULL,
  -- Economics (per-funnel; never share global TARGET_CPA)
  estimated_fulfillment_cost_inr numeric(14, 2) NOT NULL DEFAULT 0,
  contribution_margin_inr numeric(14, 2),
  aov_inr numeric(14, 2),
  target_cpa numeric(14, 2) NOT NULL,
  max_acceptable_cpa numeric(14, 2) NOT NULL,
  target_roas numeric(10, 4) NOT NULL,
  min_roas numeric(10, 4) NOT NULL,
  daily_budget_inr numeric(14, 2),
  test_budget_inr numeric(14, 2),
  max_daily_budget_inr numeric(14, 2),
  max_budget_increase_percent numeric(8, 2) NOT NULL DEFAULT 20,
  max_budget_decrease_percent numeric(8, 2) NOT NULL DEFAULT 50,
  min_spend_before_pause numeric(14, 2) NOT NULL DEFAULT 500,
  min_purchases_for_winner numeric(14, 2) NOT NULL DEFAULT 3,
  min_data_window_days integer NOT NULL DEFAULT 3,
  conversion_event text NOT NULL DEFAULT 'purchase',
  landing_page text,
  checkout_url text,
  target_audience text,
  -- Downstream / blended value (optional)
  tracks_downstream_upsell boolean NOT NULL DEFAULT false,
  downstream_funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL,
  notes text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_funnels_price_positive CHECK (price_inr > 0),
  CONSTRAINT marketing_funnels_cpa_order CHECK (max_acceptable_cpa >= target_cpa)
);

CREATE INDEX IF NOT EXISTS marketing_funnels_slug_idx ON public.marketing_funnels(slug);
CREATE INDEX IF NOT EXISTS marketing_funnels_status_idx ON public.marketing_funnels(status);

-- Attach funnel_id to marketing entities (NULL = UNCLASSIFIED — do not guess)
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_adsets
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_ads
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_creatives
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_performance
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_experiments
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_ai_decisions
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_ai_actions
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_content
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_generation_jobs
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_funnel_snapshots
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS marketing_campaigns_funnel_idx ON public.marketing_campaigns(funnel_id);
CREATE INDEX IF NOT EXISTS marketing_adsets_funnel_idx ON public.marketing_adsets(funnel_id);
CREATE INDEX IF NOT EXISTS marketing_ads_funnel_idx ON public.marketing_ads(funnel_id);
CREATE INDEX IF NOT EXISTS marketing_creatives_funnel_idx ON public.marketing_creatives(funnel_id);
CREATE INDEX IF NOT EXISTS marketing_performance_funnel_idx ON public.marketing_performance(funnel_id);
CREATE INDEX IF NOT EXISTS marketing_ai_decisions_funnel_idx ON public.marketing_ai_decisions(funnel_id);

-- Daily per-funnel report snapshots
CREATE TABLE IF NOT EXISTS public.marketing_funnel_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  funnel_id uuid REFERENCES public.marketing_funnels(id) ON DELETE CASCADE,
  -- NULL funnel_id = BUSINESS TOTAL / blended row
  spend numeric(14, 4) NOT NULL DEFAULT 0,
  revenue numeric(14, 4) NOT NULL DEFAULT 0,
  purchases numeric(14, 4) NOT NULL DEFAULT 0,
  cpa numeric(14, 4),
  roas numeric(14, 4),
  ctr numeric(10, 6),
  cpc numeric(14, 4),
  cpm numeric(14, 4),
  conversion_rate numeric(10, 6),
  initial_roas numeric(14, 4),
  blended_customer_value numeric(14, 4),
  downstream_revenue numeric(14, 4) NOT NULL DEFAULT 0,
  trend text,
  ai_diagnosis text,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (report_date, funnel_id)
);

CREATE INDEX IF NOT EXISTS marketing_funnel_daily_reports_date_idx
  ON public.marketing_funnel_daily_reports(report_date DESC);

-- Extend action_type check for funnel budget recommendations
ALTER TABLE public.marketing_ai_actions DROP CONSTRAINT IF EXISTS marketing_ai_actions_action_type_check;
ALTER TABLE public.marketing_ai_actions ADD CONSTRAINT marketing_ai_actions_action_type_check
  CHECK (action_type IN (
    'PAUSE_AD', 'RESUME_AD', 'INCREASE_BUDGET', 'DECREASE_BUDGET',
    'KEEP_RUNNING', 'CREATE_NEW_CREATIVE', 'CREATE_NEW_TEST',
    'INVESTIGATE_FUNNEL', 'NO_ACTION', 'SYNC_META', 'CREATE_CAMPAIGN',
    'CREATE_ADSET', 'CREATE_AD', 'CREATE_CREATIVE', 'UPDATE_AD',
    'UPDATE_CAMPAIGN', 'UPDATE_ADSET', 'GENERATE_VARIATIONS',
    'LAUNCH_EXPERIMENT', 'NOTIFY',
    'INCREASE_FUNNEL_BUDGET', 'DECREASE_FUNNEL_BUDGET',
    'CONTINUE_TESTING_FUNNELS', 'REALLOCATE_BUDGET_RECOMMENDATION'
  ));

ALTER TABLE public.marketing_funnels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read marketing_funnels" ON public.marketing_funnels;
CREATE POLICY "Admins read marketing_funnels"
  ON public.marketing_funnels FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write marketing_funnels" ON public.marketing_funnels;
CREATE POLICY "Admins write marketing_funnels"
  ON public.marketing_funnels FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.marketing_funnel_daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read marketing_funnel_daily_reports" ON public.marketing_funnel_daily_reports;
CREATE POLICY "Admins read marketing_funnel_daily_reports"
  ON public.marketing_funnel_daily_reports FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write marketing_funnel_daily_reports" ON public.marketing_funnel_daily_reports;
CREATE POLICY "Admins write marketing_funnel_daily_reports"
  ON public.marketing_funnel_daily_reports FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Seed the two LURVOX acquisition funnels
-- Economics notes:
-- ₹99: low-ticket impulse; CPA must be judged vs price & margin, not vs ₹1699 CPA.
-- ₹1699: higher-ticket; separate thresholds. Do NOT share TARGET_CPA=2500 globally.
INSERT INTO public.marketing_funnels (
  slug, name, offer, product, price_inr,
  estimated_fulfillment_cost_inr, contribution_margin_inr, aov_inr,
  target_cpa, max_acceptable_cpa, target_roas, min_roas,
  daily_budget_inr, test_budget_inr, max_daily_budget_inr,
  min_spend_before_pause, min_purchases_for_winner,
  conversion_event, landing_page, target_audience,
  tracks_downstream_upsell, notes, status
) VALUES
(
  'lurvox-99',
  'LURVOX ₹99 Funnel',
  'Low-ticket entry offer',
  'LURVOX ₹99 offer',
  99,
  15,
  84,
  99,
  45,
  80,
  1.5,
  1.0,
  3000,
  1000,
  15000,
  400,
  5,
  'purchase',
  'https://www.lurvox.in',
  'Impulse / price-sensitive beginners seeking low-commitment entry',
  true,
  'Initial ROAS uses ₹99 AOV. Blended customer value must track downstream upsells separately — do not confuse the two.',
  'active'
),
(
  'lurvox-1699',
  'LURVOX ₹1,699 Funnel',
  'Higher-ticket offer',
  'LURVOX ₹1,699 offer',
  1699,
  200,
  1499,
  1699,
  850,
  1200,
  2.0,
  1.2,
  8000,
  3000,
  40000,
  1500,
  3,
  'purchase',
  'https://www.lurvox.in',
  'High-intent buyers needing trust, transformation, and objection handling',
  false,
  'Independent economics from ₹99 funnel. Never apply ₹99 CPA thresholds here.',
  'active'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  offer = EXCLUDED.offer,
  product = EXCLUDED.product,
  price_inr = EXCLUDED.price_inr,
  estimated_fulfillment_cost_inr = EXCLUDED.estimated_fulfillment_cost_inr,
  contribution_margin_inr = EXCLUDED.contribution_margin_inr,
  aov_inr = EXCLUDED.aov_inr,
  target_cpa = EXCLUDED.target_cpa,
  max_acceptable_cpa = EXCLUDED.max_acceptable_cpa,
  target_roas = EXCLUDED.target_roas,
  min_roas = EXCLUDED.min_roas,
  daily_budget_inr = EXCLUDED.daily_budget_inr,
  test_budget_inr = EXCLUDED.test_budget_inr,
  max_daily_budget_inr = EXCLUDED.max_daily_budget_inr,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Link ₹99 downstream to ₹1699 when both exist
UPDATE public.marketing_funnels AS low
SET downstream_funnel_id = high.id,
    updated_at = now()
FROM public.marketing_funnels AS high
WHERE low.slug = 'lurvox-99'
  AND high.slug = 'lurvox-1699';

-- Account-level guardrails: remove reliance on a single TARGET_CPA/ROAS.
-- Keep account spend caps; per-funnel economics live on marketing_funnels.
UPDATE public.marketing_settings
SET value = (value - 'TARGET_CPA' - 'TARGET_ROAS')
  || jsonb_build_object(
    'note',
    'TARGET_CPA and TARGET_ROAS are per-funnel on marketing_funnels. Account guardrails are spend/change caps only.'
  ),
  updated_at = now()
WHERE key = 'guardrails';
