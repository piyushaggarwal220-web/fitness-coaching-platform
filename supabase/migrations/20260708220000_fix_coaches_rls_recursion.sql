-- Break coaches <-> profiles RLS recursion introduced by "Clients can read assigned coach"
-- (coaches policy queried profiles; profiles policies queried coaches).

CREATE OR REPLACE FUNCTION public.is_assigned_coach(coach_row_id uuid)
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
      AND coach_id = coach_row_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_assigned_coach(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_assigned_coach(uuid) TO authenticated;

DROP POLICY IF EXISTS "Clients can read assigned coach" ON coaches;

CREATE POLICY "Clients can read assigned coach"
  ON coaches FOR SELECT
  USING (public.is_assigned_coach(id));

-- Use SECURITY DEFINER current_coach_id() instead of subqueries on coaches (avoids recursion).
DROP POLICY IF EXISTS "Coaches can read assigned client profiles" ON profiles;

CREATE POLICY "Coaches can read assigned client profiles"
  ON profiles FOR SELECT
  USING (
    coach_id IS NOT NULL
    AND coach_id = public.current_coach_id()
  );

DROP POLICY IF EXISTS "Coaches can update assigned client status flags" ON profiles;

CREATE POLICY "Coaches can update assigned client status flags"
  ON profiles FOR UPDATE
  USING (
    coach_id IS NOT NULL
    AND coach_id = public.current_coach_id()
  );
