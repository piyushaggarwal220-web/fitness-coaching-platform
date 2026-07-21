-- Start a new client's coaching schedule at midnight IST following first plan delivery.

CREATE OR REPLACE FUNCTION public.first_coaching_day_start(delivered_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT (
    date_trunc('day', $1 AT TIME ZONE 'Asia/Kolkata') + interval '1 day'
  ) AT TIME ZONE 'Asia/Kolkata';
$$;

COMMENT ON FUNCTION public.first_coaching_day_start(timestamptz) IS
  'Returns midnight IST at the start of the calendar day after plan delivery.';

REVOKE EXECUTE ON FUNCTION public.first_coaching_day_start(timestamptz)
  FROM PUBLIC, anon, authenticated;

-- Privileged profile fields remain server-derived. The immutable schedule anchor
-- now derives from the first delivery's following midnight instead of its exact time.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.payment_confirmed := false;
    NEW.access_source := NULL;
    NEW.plan_delivered := false;
    NEW.checkin_schedule_started_at := NULL;
    IF NEW.coach_id IS NOT NULL THEN
      NEW.coach_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.payment_confirmed := OLD.payment_confirmed;
  NEW.access_source := OLD.access_source;
  NEW.plan_delivered := EXISTS (
    SELECT 1 FROM plans
    WHERE client_id = OLD.id AND active = true
  );
  NEW.checkin_schedule_started_at := COALESCE(
    OLD.checkin_schedule_started_at,
    (
      SELECT public.first_coaching_day_start(MIN(delivered_at))
      FROM plans
      WHERE client_id = OLD.id AND delivered_at IS NOT NULL
    )
  );
  NEW.coach_id := OLD.coach_id;
  NEW.role := OLD.role;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_profile_privileged_fields() IS
  'Blocks non-admin/non-service entitlement and assignment changes; derives an immutable next-midnight coaching anchor from plan delivery.';

-- Keep plan delivery state and the first coaching-day anchor authoritative when
-- plans are inserted, activated, moved by an administrator, or deleted.
CREATE OR REPLACE FUNCTION public.sync_profile_plan_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_client_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    affected_client_ids := ARRAY[NEW.client_id];
  ELSIF TG_OP = 'DELETE' THEN
    affected_client_ids := ARRAY[OLD.client_id];
  ELSE
    affected_client_ids := ARRAY[NEW.client_id, OLD.client_id];
  END IF;

  UPDATE profiles p
  SET plan_delivered = EXISTS (
        SELECT 1
        FROM plans pl
        WHERE pl.client_id = p.id AND pl.active = true
      ),
      checkin_schedule_started_at = COALESCE(
        p.checkin_schedule_started_at,
        (
          SELECT public.first_coaching_day_start(MIN(pl.delivered_at))
          FROM plans pl
          WHERE pl.client_id = p.id AND pl.delivered_at IS NOT NULL
        )
      ),
      updated_at = now()
  WHERE p.id = ANY(affected_client_ids);

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_plan_delivered()
  FROM PUBLIC, anon, authenticated;
