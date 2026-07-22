-- Allow coaches to deliver plans before the client finishes every onboarding answer.
-- Client app access remains gated in application code by answer completeness.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_delivered_requires_onboarding;

CREATE OR REPLACE FUNCTION public.validate_plan_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_coach_id uuid;
BEGIN
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.active IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT coach_id
  INTO client_coach_id
  FROM profiles
  WHERE id = NEW.client_id;

  IF client_coach_id IS NULL THEN
    RAISE EXCEPTION 'Cannot activate plan: client has no assigned coach';
  END IF;

  IF client_coach_id IS DISTINCT FROM NEW.coach_id THEN
    RAISE EXCEPTION 'Cannot activate plan: plan coach does not match assigned coach';
  END IF;

  IF NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;

  RETURN NEW;
END;
$$;
