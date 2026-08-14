-- Speed up coach work-queue / dashboard reads that were occasionally multi-minute.

-- Unreviewed check-ins are the hottest queue path.
CREATE INDEX IF NOT EXISTS checkins_coach_unreviewed_submitted_idx
  ON public.checkins (coach_id, submitted_at ASC)
  WHERE reviewed = false;

-- Active / undelivered plans looked up by coach on every queue load.
CREATE INDEX IF NOT EXISTS plans_coach_active_client_idx
  ON public.plans (coach_id, client_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS plans_coach_undelivered_created_idx
  ON public.plans (coach_id, client_id, created_at DESC)
  WHERE delivered_at IS NULL;

-- Avoid reading nutrition/workout text blobs on every queue load.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS has_core_content boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.plans.has_core_content IS
  'True when nutrition_plan and workout_plan both have non-empty content. Maintained by trigger for fast queue readiness checks.';

UPDATE public.plans
SET has_core_content =
  coalesce(nullif(btrim(nutrition_plan), ''), null) IS NOT NULL
  AND coalesce(nullif(btrim(workout_plan), ''), null) IS NOT NULL
WHERE active = true
   OR delivered_at IS NULL
   OR has_core_content = false;

CREATE OR REPLACE FUNCTION public.plans_sync_has_core_content()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.has_core_content :=
    coalesce(nullif(btrim(NEW.nutrition_plan), ''), null) IS NOT NULL
    AND coalesce(nullif(btrim(NEW.workout_plan), ''), null) IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_sync_has_core_content ON public.plans;
CREATE TRIGGER plans_sync_has_core_content
  BEFORE INSERT OR UPDATE OF nutrition_plan, workout_plan
  ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.plans_sync_has_core_content();

CREATE INDEX IF NOT EXISTS plans_coach_ready_active_idx
  ON public.plans (coach_id, client_id)
  WHERE active = true AND has_core_content = true;

-- Open issue reports filtered by assigned coach via profiles join.
CREATE INDEX IF NOT EXISTS issue_reports_open_client_idx
  ON public.issue_reports (client_id, created_at ASC)
  WHERE status IN ('open', 'investigating');

CREATE INDEX IF NOT EXISTS profiles_coach_id_idx
  ON public.profiles (coach_id)
  WHERE coach_id IS NOT NULL;
