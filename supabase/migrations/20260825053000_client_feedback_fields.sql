-- Client plan/platform feedback (stars + topic) and extra issue/support categories.

ALTER TYPE issue_category ADD VALUE IF NOT EXISTS 'plan_complaint';
ALTER TYPE issue_category ADD VALUE IF NOT EXISTS 'plan_review';
ALTER TYPE issue_category ADD VALUE IF NOT EXISTS 'platform_review';

ALTER TYPE support_request_category ADD VALUE IF NOT EXISTS 'plan_complaint';
ALTER TYPE support_request_category ADD VALUE IF NOT EXISTS 'plan_review';
ALTER TYPE support_request_category ADD VALUE IF NOT EXISTS 'platform_feedback';

ALTER TABLE public.issue_reports
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS topic text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issue_reports_rating_range'
  ) THEN
    ALTER TABLE public.issue_reports
      ADD CONSTRAINT issue_reports_rating_range
      CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issue_reports_topic_check'
  ) THEN
    ALTER TABLE public.issue_reports
      ADD CONSTRAINT issue_reports_topic_check
      CHECK (topic IS NULL OR topic IN ('plan', 'tracker', 'platform'));
  END IF;
END $$;
