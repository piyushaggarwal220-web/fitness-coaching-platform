-- Jarvis Phase 21: Long-horizon management extensions on jarvis_strategic_plans
-- Extends Phase 16 — does not create a second plan system.

ALTER TABLE public.jarvis_strategic_plans
  ADD COLUMN IF NOT EXISTS time_horizon text DEFAULT '30_DAYS'
    CHECK (time_horizon IS NULL OR time_horizon IN ('7_DAYS', '30_DAYS', '90_DAYS', 'CUSTOM')),
  ADD COLUMN IF NOT EXISTS health text DEFAULT 'UNKNOWN'
    CHECK (health IS NULL OR health IN (
      'ON_TRACK', 'WATCH', 'AT_RISK', 'BLOCKED', 'REPLAN_REQUIRED', 'UNKNOWN'
    )),
  ADD COLUMN IF NOT EXISTS health_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS opportunity_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS experiment_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS horizon_start date,
  ADD COLUMN IF NOT EXISTS horizon_end date;

-- Expand plan status vocabulary for long-horizon states
ALTER TABLE public.jarvis_strategic_plans DROP CONSTRAINT IF EXISTS jarvis_strategic_plans_status_check;
ALTER TABLE public.jarvis_strategic_plans
  ADD CONSTRAINT jarvis_strategic_plans_status_check
  CHECK (status IN (
    'DRAFT', 'ACTIVE', 'REPLANNING', 'COMPLETED', 'CANCELLED', 'SUPERSEDED',
    'PLANNED', 'AT_RISK', 'BLOCKED', 'PAUSED', 'ABANDONED'
  ));

CREATE INDEX IF NOT EXISTS jarvis_strategic_plans_health_idx
  ON public.jarvis_strategic_plans(health, status, next_review_at);
