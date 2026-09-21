-- Phase 2: creative performance status, Meta push idempotency, test launches

ALTER TABLE public.marketing_creatives
  ADD COLUMN IF NOT EXISTS performance_status text,
  ADD COLUMN IF NOT EXISTS meta_push_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_creatives_meta_push_idempotency_uidx
  ON public.marketing_creatives(meta_push_idempotency_key)
  WHERE meta_push_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_creatives_performance_status_idx
  ON public.marketing_creatives(performance_status);

CREATE TABLE IF NOT EXISTS public.marketing_test_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.marketing_funnels(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text NOT NULL DEFAULT 'OUTCOME_SALES',
  daily_budget_inr numeric(14, 2) NOT NULL,
  test_days integer NOT NULL DEFAULT 3,
  expected_spend_inr numeric(14, 2) NOT NULL,
  creative_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'preview'
    CHECK (status IN (
      'preview', 'pending_approval', 'approved', 'created_paused',
      'activated', 'failed', 'cancelled'
    )),
  idempotency_key text NOT NULL UNIQUE,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  local_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  execution_result jsonb,
  error text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

CREATE INDEX IF NOT EXISTS marketing_test_launches_funnel_idx
  ON public.marketing_test_launches(funnel_id);
CREATE INDEX IF NOT EXISTS marketing_test_launches_status_idx
  ON public.marketing_test_launches(status);

ALTER TABLE public.marketing_test_launches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read marketing_test_launches" ON public.marketing_test_launches;
CREATE POLICY "Admins read marketing_test_launches"
  ON public.marketing_test_launches FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write marketing_test_launches" ON public.marketing_test_launches;
CREATE POLICY "Admins write marketing_test_launches"
  ON public.marketing_test_launches FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
