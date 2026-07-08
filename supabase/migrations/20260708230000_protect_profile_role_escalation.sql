-- Prevent clients (or any non-admin) from elevating profiles.role via RLS-permitted self-updates.

CREATE OR REPLACE FUNCTION public.protect_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(auth.role(), '') <> 'service_role'
       AND NEW.role IS DISTINCT FROM 'client'::user_role THEN
      NEW.role := 'client'::user_role;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF coalesce(auth.role(), '') = 'service_role' THEN
      RETURN NEW;
    END IF;

    IF auth.uid() = OLD.id THEN
      RAISE EXCEPTION 'Cannot change your own role';
    END IF;

    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Insufficient privileges to change role';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_change ON profiles;

CREATE TRIGGER protect_profile_role_change
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role_change();

-- Safety: ensure trial/paid clients were not accidentally promoted
UPDATE profiles
SET role = 'client', updated_at = now()
WHERE email IN ('rakshit@gmail.com', 'client@test.com')
  AND role <> 'client';
