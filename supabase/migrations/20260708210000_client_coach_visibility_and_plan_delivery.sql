-- Clients can read their assigned coach (fixes dashboard "Assigning soon" when coach is set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coaches'
      AND policyname = 'Clients can read assigned coach'
  ) THEN
    CREATE POLICY "Clients can read assigned coach"
      ON coaches FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.coach_id = coaches.id
        )
      );
  END IF;
END $$;

-- Ensure plan_delivered exists on profiles (used by coach + client dashboards)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_delivered boolean NOT NULL DEFAULT false;

-- Keep profiles.plan_delivered in sync when plans are activated/deactivated
CREATE OR REPLACE FUNCTION public.sync_profile_plan_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_client_id uuid;
  active_count integer;
BEGIN
  target_client_id := COALESCE(NEW.client_id, OLD.client_id);

  SELECT COUNT(*)::integer INTO active_count
  FROM plans
  WHERE client_id = target_client_id AND active = true;

  UPDATE profiles
  SET plan_delivered = active_count > 0
  WHERE id = target_client_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS plans_sync_profile_plan_delivered ON plans;
CREATE TRIGGER plans_sync_profile_plan_delivered
  AFTER INSERT OR UPDATE OF active OR DELETE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_plan_delivered();

-- Backfill plan_delivered for clients who already have active plans
UPDATE profiles p
SET plan_delivered = true
WHERE plan_delivered = false
  AND EXISTS (
    SELECT 1 FROM plans pl
    WHERE pl.client_id = p.id AND pl.active = true
  );
