-- Coaches must not read or update trial / smoke-test client profiles.
-- Admin policies and the named demo client (client@test.local) stay unchanged.

CREATE OR REPLACE FUNCTION public.is_trial_client_hidden_from_coaches(p_email text, p_access_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN lower(trim(COALESCE(p_email, ''))) = 'client@test.local' THEN false
      WHEN lower(trim(COALESCE(p_email, ''))) LIKE '%@trial.test.local' THEN true
      WHEN COALESCE(p_access_source, '') = 'admin_trial' THEN true
      ELSE false
    END
$$;

REVOKE ALL ON FUNCTION public.is_trial_client_hidden_from_coaches(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trial_client_hidden_from_coaches(text, text) TO authenticated;

DROP POLICY IF EXISTS "Coaches can read assigned client profiles" ON profiles;

CREATE POLICY "Coaches can read assigned client profiles"
  ON profiles FOR SELECT
  USING (
    coach_id IS NOT NULL
    AND coach_id = public.current_coach_id()
    AND NOT public.is_trial_client_hidden_from_coaches(email, access_source)
  );

DROP POLICY IF EXISTS "Coaches can update assigned client status flags" ON profiles;

CREATE POLICY "Coaches can update assigned client status flags"
  ON profiles FOR UPDATE
  USING (
    coach_id IS NOT NULL
    AND coach_id = public.current_coach_id()
    AND NOT public.is_trial_client_hidden_from_coaches(email, access_source)
  )
  WITH CHECK (
    coach_id IS NOT NULL
    AND coach_id = public.current_coach_id()
    AND NOT public.is_trial_client_hidden_from_coaches(email, access_source)
  );
