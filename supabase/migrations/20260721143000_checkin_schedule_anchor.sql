-- Anchor recurring check-ins to the client's first successfully delivered plan.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS checkin_schedule_started_at timestamptz;

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

COMMENT ON COLUMN profiles.checkin_schedule_started_at IS
  'Immutable check-in schedule anchor set from the first successful plan delivery.';
COMMENT ON COLUMN checkins.due_at IS
  'Exact anchored due timestamp for this check-in slot.';

-- A coach may publish a draft, but cannot manufacture delivery history on an
-- inactive plan or move a delivered plan to another client/coach.
CREATE OR REPLACE FUNCTION public.protect_plan_delivery_identity()
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
    NEW.delivered_at := CASE WHEN NEW.active IS TRUE THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;

  IF OLD.delivered_at IS NOT NULL THEN
    NEW.client_id := OLD.client_id;
    NEW.coach_id := OLD.coach_id;
  END IF;

  IF OLD.active IS FALSE AND NEW.active IS TRUE THEN
    NEW.delivered_at := now();
  ELSE
    NEW.delivered_at := OLD.delivered_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_protect_delivery_identity ON plans;
CREATE TRIGGER plans_protect_delivery_identity
  BEFORE INSERT OR UPDATE OF active, delivered_at, client_id, coach_id ON plans
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_plan_delivery_identity();

REVOKE EXECUTE ON FUNCTION public.protect_plan_delivery_identity() FROM PUBLIC, anon, authenticated;

-- The anchor is privileged state. Non-admin profile writes derive it from plans
-- instead of accepting a caller-provided timestamp.
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
      SELECT MIN(delivered_at)
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
  'Blocks non-admin/non-service entitlement and assignment changes; derives immutable check-in anchor from plan delivery.';

-- Existing delivered plans establish the anchor. MIN makes the backfill stable
-- even when the currently active plan is a later weekly update.
UPDATE profiles p
SET checkin_schedule_started_at = first_delivery.delivered_at
FROM (
  SELECT client_id, MIN(delivered_at) AS delivered_at
  FROM plans
  WHERE delivered_at IS NOT NULL
  GROUP BY client_id
) first_delivery
WHERE p.id = first_delivery.client_id
  AND p.checkin_schedule_started_at IS NULL;

-- Keep plan_delivered authoritative and initialize (never replace) the anchor.
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
          SELECT MIN(pl.delivered_at)
          FROM plans pl
          WHERE pl.client_id = p.id AND pl.delivered_at IS NOT NULL
        )
      ),
      updated_at = now()
  WHERE p.id = ANY(affected_client_ids);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS plans_sync_profile_plan_delivered ON plans;
CREATE TRIGGER plans_sync_profile_plan_delivered
  AFTER INSERT OR UPDATE OF active, delivered_at, client_id OR DELETE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_plan_delivered();

-- Historical rows are unambiguous when week/type and a delivery anchor exist.
UPDATE checkins c
SET due_at = p.checkin_schedule_started_at
  + make_interval(
      days => ((c.coaching_week - 1) * 7)
        + CASE c.checkin_type
            WHEN 'mid_week'::checkin_type THEN 2
            WHEN 'weekly'::checkin_type THEN 6
          END
    )
FROM profiles p
WHERE p.id = c.client_id
  AND c.due_at IS NULL
  AND p.checkin_schedule_started_at IS NOT NULL
  AND c.coaching_week IS NOT NULL
  AND c.coaching_week >= 1
  AND c.checkin_type IN ('mid_week'::checkin_type, 'weekly'::checkin_type);

CREATE INDEX IF NOT EXISTS checkins_due_at_idx ON checkins (due_at);

REVOKE EXECUTE ON FUNCTION public.sync_profile_plan_delivered() FROM PUBLIC, anon, authenticated;
