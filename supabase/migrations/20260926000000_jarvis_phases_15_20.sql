-- Jarvis Phases 15–20: Opportunities, Goals/Plans, Experiment lifecycle extensions
-- Does NOT duplicate jarvis_memory / jarvis_events / marketing_performance / purchases.
-- Phase 12/13/14 remain authoritative for execution / events / strategic memory.

-- ---------------------------------------------------------------------------
-- Phase 15 — Business opportunities (unified lifecycle; niche/video opps stay separate)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jarvis_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  type text NOT NULL
    CHECK (type IN (
      'MARKETING_EFFICIENCY', 'FUNNEL', 'CONTENT', 'CREATIVE', 'REVENUE',
      'FINANCIAL', 'OPERATIONAL', 'SYSTEM_RISK', 'INTEGRATION_RISK',
      'EXPERIMENT', 'CUSTOMER', 'INSTAGRAM', 'SHOPIFY'
    )),
  title text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'DETECTED'
    CHECK (status IN (
      'DETECTED', 'SCORED', 'INVESTIGATING', 'VALIDATED', 'PROPOSED',
      'APPROVAL_REQUIRED', 'EXECUTING', 'MEASURING', 'LEARNED',
      'EXPIRED', 'SUPERSEDED', 'DISMISSED', 'SNOOZED'
    )),
  priority text NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  funnel_id text,
  system text NOT NULL DEFAULT 'OTHER',
  source_event_ids uuid[] NOT NULL DEFAULT '{}',
  source_memory_ids uuid[] NOT NULL DEFAULT '{}',
  source_decision_ids uuid[] NOT NULL DEFAULT '{}',
  source_measurement_ids uuid[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_facts text[] NOT NULL DEFAULT '{}',
  inferences text[] NOT NULL DEFAULT '{}',
  hypotheses text[] NOT NULL DEFAULT '{}',
  recommendations text[] NOT NULL DEFAULT '{}',
  confidence text NOT NULL DEFAULT 'LOW'
    CHECK (confidence IN ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')),
  evidence_strength text NOT NULL DEFAULT 'INSUFFICIENT'
    CHECK (evidence_strength IN ('INSUFFICIENT', 'WEAK', 'MODERATE', 'STRONG')),
  freshness text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (freshness IN ('FRESH', 'RECENT', 'STALE', 'UNKNOWN')),
  uncertainty text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (uncertainty IN ('KNOWN', 'LIKELY', 'POSSIBLE', 'UNKNOWN')),
  expected_impact text,
  impact_range jsonb NOT NULL DEFAULT '{}'::jsonb,
  impact_currency text NOT NULL DEFAULT 'INR',
  impact_horizon text,
  actionability text NOT NULL DEFAULT 'MEDIUM'
    CHECK (actionability IN ('LOW', 'MEDIUM', 'HIGH')),
  urgency text NOT NULL DEFAULT 'MEDIUM'
    CHECK (urgency IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  opportunity_cost text,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  goal_id uuid,
  plan_id uuid,
  snooze_until timestamptz,
  expires_at timestamptz,
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fingerprint)
);

CREATE INDEX IF NOT EXISTS jarvis_opportunities_status_idx
  ON public.jarvis_opportunities(status, priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_opportunities_funnel_idx
  ON public.jarvis_opportunities(funnel_id, status);
CREATE INDEX IF NOT EXISTS jarvis_opportunities_type_idx
  ON public.jarvis_opportunities(type, created_at DESC);

-- ---------------------------------------------------------------------------
-- Phase 16 — Goals & strategic plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jarvis_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type text NOT NULL
    CHECK (type IN (
      'REVENUE', 'PROFIT', 'CUSTOMER_ACQUISITION', 'CPA', 'ROAS',
      'CONTENT', 'AUDIENCE', 'PRODUCT', 'OPERATIONS', 'SYSTEM_RELIABILITY',
      'EXPERIMENTATION', 'CUSTOM'
    )),
  scope text NOT NULL DEFAULT 'GLOBAL_BUSINESS',
  funnel_id text,
  metric text,
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit text,
  start_date date,
  target_date date,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'AT_RISK', 'ACHIEVED', 'MISSED', 'PAUSED', 'CANCELLED', 'SUPERSEDED')),
  priority text NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  owner text,
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_goals_status_idx ON public.jarvis_goals(status, priority);

CREATE TABLE IF NOT EXISTS public.jarvis_strategic_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'REPLANNING', 'COMPLETED', 'CANCELLED', 'SUPERSEDED')),
  goal_ids uuid[] NOT NULL DEFAULT '{}',
  milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  initiatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  funnel_id text,
  version integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.jarvis_strategic_plans(id) ON DELETE SET NULL,
  replan_reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_strategic_plans_status_idx
  ON public.jarvis_strategic_plans(status, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jarvis_opportunities_goal_fk'
  ) THEN
    ALTER TABLE public.jarvis_opportunities
      ADD CONSTRAINT jarvis_opportunities_goal_fk
      FOREIGN KEY (goal_id) REFERENCES public.jarvis_goals(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jarvis_opportunities_plan_fk'
  ) THEN
    ALTER TABLE public.jarvis_opportunities
      ADD CONSTRAINT jarvis_opportunities_plan_fk
      FOREIGN KEY (plan_id) REFERENCES public.jarvis_strategic_plans(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Phase 20 — Extend marketing_experiments (reuse; do not fork)
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketing_experiments
  ADD COLUMN IF NOT EXISTS primary_metric text,
  ADD COLUMN IF NOT EXISTS secondary_metrics text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS population text,
  ADD COLUMN IF NOT EXISTS minimum_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_sufficiency text DEFAULT 'INSUFFICIENT'
    CHECK (data_sufficiency IS NULL OR data_sufficiency IN (
      'INSUFFICIENT', 'PRELIMINARY', 'SUFFICIENT', 'STRONG'
    )),
  ADD COLUMN IF NOT EXISTS decision_rule text,
  ADD COLUMN IF NOT EXISTS cost_limit_usd numeric,
  ADD COLUMN IF NOT EXISTS approval_id uuid,
  ADD COLUMN IF NOT EXISTS learning_memory_id uuid,
  ADD COLUMN IF NOT EXISTS limitations text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS jarvis_lifecycle text DEFAULT 'IDEA'
    CHECK (jarvis_lifecycle IS NULL OR jarvis_lifecycle IN (
      'IDEA', 'HYPOTHESIS', 'DESIGN', 'BASELINE', 'APPROVAL', 'RUNNING',
      'DATA_COLLECTION', 'SUFFICIENT_DATA', 'ANALYSIS', 'DECISION',
      'LEARNED', 'INCONCLUSIVE', 'STOPPED', 'INVALID', 'EXPIRED'
    ));

-- Expand status if needed (keep legacy)
ALTER TABLE public.marketing_experiments DROP CONSTRAINT IF EXISTS marketing_experiments_status_check;
ALTER TABLE public.marketing_experiments
  ADD CONSTRAINT marketing_experiments_status_check
  CHECK (status IN (
    'draft', 'running', 'paused', 'completed', 'cancelled',
    'inconclusive', 'stopped', 'invalid', 'expired'
  ));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.jarvis_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_strategic_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read jarvis_opportunities" ON public.jarvis_opportunities;
CREATE POLICY "Admins read jarvis_opportunities"
  ON public.jarvis_opportunities FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_opportunities" ON public.jarvis_opportunities;
CREATE POLICY "Admins write jarvis_opportunities"
  ON public.jarvis_opportunities FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins read jarvis_goals" ON public.jarvis_goals;
CREATE POLICY "Admins read jarvis_goals"
  ON public.jarvis_goals FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_goals" ON public.jarvis_goals;
CREATE POLICY "Admins write jarvis_goals"
  ON public.jarvis_goals FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins read jarvis_strategic_plans" ON public.jarvis_strategic_plans;
CREATE POLICY "Admins read jarvis_strategic_plans"
  ON public.jarvis_strategic_plans FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_strategic_plans" ON public.jarvis_strategic_plans;
CREATE POLICY "Admins write jarvis_strategic_plans"
  ON public.jarvis_strategic_plans FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
