-- Production integrity: entitlements, FKs, plan delivery invariants, single active plan

-- ---------------------------------------------------------------------------
-- 1. access_source (pending migration 20260708000000)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS access_source text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_access_source_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_access_source_check
  CHECK (access_source IS NULL OR access_source IN ('purchase', 'admin_trial'));

CREATE INDEX IF NOT EXISTS profiles_access_source_idx ON profiles(access_source)
  WHERE access_source IS NOT NULL;

COMMENT ON COLUMN profiles.access_source IS
  'How platform access was granted: purchase (Razorpay) or admin_trial (internal QA/demo).';

-- ---------------------------------------------------------------------------
-- 2. Data repair (before constraints)
-- ---------------------------------------------------------------------------

-- Trial / manual grants: payment_confirmed without purchase record
UPDATE profiles p
SET access_source = 'admin_trial', updated_at = now()
WHERE p.payment_confirmed = true
  AND p.access_source IS NULL
  AND p.role = 'client'
  AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.user_id = p.id);

-- Paid clients: link access_source to purchase
UPDATE profiles p
SET access_source = 'purchase', updated_at = now()
WHERE p.payment_confirmed = true
  AND p.access_source IS NULL
  AND EXISTS (SELECT 1 FROM purchases pu WHERE pu.user_id = p.id);

-- Orphan coach assignments
UPDATE profiles
SET coach_id = NULL, updated_at = now()
WHERE coach_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM coaches c WHERE c.id = profiles.coach_id);

-- Plans delivered while onboarding incomplete: deactivate (trigger syncs plan_delivered)
UPDATE plans
SET active = false, updated_at = now()
WHERE active = true
  AND client_id IN (
    SELECT id FROM profiles WHERE onboarding_complete = false
  );

-- Orphan coaches (no profile row, no assigned clients)
DELETE FROM coaches c
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = c.user_id)
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.coach_id = c.id);

-- Plan/coach assignment mismatch: align plan coach to profile coach when profile has coach
UPDATE plans pl
SET coach_id = p.coach_id, updated_at = now()
FROM profiles p
WHERE p.id = pl.client_id
  AND p.coach_id IS NOT NULL
  AND pl.coach_id IS DISTINCT FROM p.coach_id;

-- Active plans must have delivered_at
UPDATE plans
SET delivered_at = COALESCE(delivered_at, updated_at, now())
WHERE active = true AND delivered_at IS NULL;

-- Re-sync plan_delivered flags
UPDATE profiles p
SET plan_delivered = EXISTS (
  SELECT 1 FROM plans pl WHERE pl.client_id = p.id AND pl.active = true
)
WHERE plan_delivered IS DISTINCT FROM EXISTS (
  SELECT 1 FROM plans pl WHERE pl.client_id = p.id AND pl.active = true
);

-- ---------------------------------------------------------------------------
-- 3. Foreign keys (profiles ↔ coaches)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_coach_id_fkey;
ALTER TABLE coaches DROP CONSTRAINT IF EXISTS coaches_user_id_fkey;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES coaches(id) ON DELETE SET NULL;

ALTER TABLE coaches
  ADD CONSTRAINT coaches_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Profile invariants
-- ---------------------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_delivered_requires_onboarding;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_delivered_requires_onboarding
  CHECK (NOT plan_delivered OR onboarding_complete);

-- Auto-tag entitlement source when payment is confirmed
CREATE OR REPLACE FUNCTION public.sync_profile_entitlement_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_confirmed IS TRUE AND NEW.access_source IS NULL AND NEW.role = 'client' THEN
    IF EXISTS (SELECT 1 FROM purchases WHERE user_id = NEW.id) THEN
      NEW.access_source := 'purchase';
    ELSE
      NEW.access_source := 'admin_trial';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_entitlement_source ON profiles;
CREATE TRIGGER profiles_sync_entitlement_source
  BEFORE INSERT OR UPDATE OF payment_confirmed, access_source ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_entitlement_source();

-- ---------------------------------------------------------------------------
-- 5. Plan activation invariants
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS plans_one_active_per_client_idx
  ON plans(client_id)
  WHERE active = true;

CREATE OR REPLACE FUNCTION public.validate_plan_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_onboarded boolean;
  client_coach_id uuid;
BEGIN
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.active IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT onboarding_complete, coach_id
  INTO client_onboarded, client_coach_id
  FROM profiles
  WHERE id = NEW.client_id;

  IF client_onboarded IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot activate plan: client onboarding is incomplete';
  END IF;

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

DROP TRIGGER IF EXISTS plans_validate_activation ON plans;
CREATE TRIGGER plans_validate_activation
  BEFORE INSERT OR UPDATE OF active ON plans
  FOR EACH ROW
  WHEN (NEW.active IS TRUE)
  EXECUTE FUNCTION public.validate_plan_activation();

-- Keep profiles.plan_delivered authoritative (existing trigger may already exist)
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
  SET plan_delivered = active_count > 0,
      updated_at = now()
  WHERE id = target_client_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS plans_sync_profile_plan_delivered ON plans;
CREATE TRIGGER plans_sync_profile_plan_delivered
  AFTER INSERT OR UPDATE OF active OR DELETE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_plan_delivered();
