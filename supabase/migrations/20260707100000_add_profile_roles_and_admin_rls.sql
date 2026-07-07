-- Role-based platform access on profiles (no separate admins table)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('client', 'coach', 'admin', 'super_admin');
  END IF;
END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'client';

CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);

-- Platform admin check for RLS (SECURITY DEFINER avoids policy recursion)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- Admins: read/update all client profiles (coach assignment)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Admins can read all profiles'
  ) THEN
    CREATE POLICY "Admins can read all profiles"
      ON profiles FOR SELECT
      USING (public.is_platform_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Admins can update all profiles'
  ) THEN
    CREATE POLICY "Admins can update all profiles"
      ON profiles FOR UPDATE
      USING (public.is_platform_admin());
  END IF;
END $$;

-- Admins: read all coaches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coaches' AND policyname = 'Admins can read all coaches'
  ) THEN
    CREATE POLICY "Admins can read all coaches"
      ON coaches FOR SELECT
      USING (public.is_platform_admin());
  END IF;
END $$;

-- Admins: read all plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plans' AND policyname = 'Admins can read all plans'
  ) THEN
    CREATE POLICY "Admins can read all plans"
      ON plans FOR SELECT
      USING (public.is_platform_admin());
  END IF;
END $$;

-- Admins: read all check-ins (dashboard activity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'checkins' AND policyname = 'Admins can read all checkins'
  ) THEN
    CREATE POLICY "Admins can read all checkins"
      ON checkins FOR SELECT
      USING (public.is_platform_admin());
  END IF;
END $$;
