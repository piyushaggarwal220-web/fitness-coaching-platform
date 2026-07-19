-- Harden entitlement columns, storage listing, coaches RLS, and SECURITY DEFINER EXECUTE grants.

-- ---------------------------------------------------------------------------
-- 1. Prevent clients/coaches from changing privileged profile fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backend / service role may change anything.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Platform admins may change privileged fields.
  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.payment_confirmed := coalesce(NEW.payment_confirmed, false);
    NEW.access_source := NULL;
    NEW.plan_delivered := coalesce(NEW.plan_delivered, false);
    IF NEW.coach_id IS NOT NULL THEN
      NEW.coach_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Non-admin authenticated updates cannot touch entitlement / assignment fields.
  NEW.payment_confirmed := OLD.payment_confirmed;
  NEW.access_source := OLD.access_source;
  NEW.plan_delivered := OLD.plan_delivered;
  NEW.coach_id := OLD.coach_id;
  NEW.role := OLD.role;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER protect_profile_privileged_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_fields();

COMMENT ON FUNCTION public.protect_profile_privileged_fields() IS
  'Blocks non-admin/non-service updates to payment_confirmed, access_source, plan_delivered, coach_id, and role.';

-- ---------------------------------------------------------------------------
-- 2. Coaches table: drop overly permissive insert/update policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.coaches;
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.coaches;

DROP POLICY IF EXISTS "Admins can insert coaches" ON public.coaches;
CREATE POLICY "Admins can insert coaches"
  ON public.coaches FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can update coaches" ON public.coaches;
CREATE POLICY "Admins can update coaches"
  ON public.coaches FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Exercise demo overrides: remove world-writable UPDATE (if table still exists)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.exercise_demo_overrides') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated update exercise demo overrides" ON public.exercise_demo_overrides';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated insert exercise demo overrides" ON public.exercise_demo_overrides';
    EXECUTE 'DROP POLICY IF EXISTS "Admins manage exercise demo overrides" ON public.exercise_demo_overrides';
    EXECUTE $policy$
      CREATE POLICY "Admins manage exercise demo overrides"
        ON public.exercise_demo_overrides FOR ALL
        TO authenticated
        USING (public.is_platform_admin())
        WITH CHECK (public.is_platform_admin())
    $policy$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Photo buckets: private + owner/coach/admin read (no public listing)
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id IN ('checkin-photos', 'onboarding-photos', 'chat-images', 'chat-voice');

DROP POLICY IF EXISTS "Anyone can view checkin photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view onboarding photos" ON storage.objects;

DROP POLICY IF EXISTS "Owners read checkin photos" ON storage.objects;
CREATE POLICY "Owners read checkin photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Assigned coaches read checkin photos" ON storage.objects;
CREATE POLICY "Assigned coaches read checkin photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.coach_id = public.current_coach_id()
    )
  );

DROP POLICY IF EXISTS "Admins read checkin photos" ON storage.objects;
CREATE POLICY "Admins read checkin photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Owners read onboarding photos" ON storage.objects;
CREATE POLICY "Owners read onboarding photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'onboarding-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Assigned coaches read onboarding photos" ON storage.objects;
CREATE POLICY "Assigned coaches read onboarding photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'onboarding-photos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.coach_id = public.current_coach_id()
    )
  );

DROP POLICY IF EXISTS "Admins read onboarding photos" ON storage.objects;
CREATE POLICY "Admins read onboarding photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'onboarding-photos'
    AND public.is_platform_admin()
  );

-- Chat images: uploader folder + conversation peers (path = userId/conversationId/...)
DROP POLICY IF EXISTS "Users read chat images in their conversations" ON storage.objects;
CREATE POLICY "Users read chat images in their conversations"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1
        FROM public.coach_conversations cc
        JOIN public.coaches c ON c.id = cc.coach_id
        WHERE c.user_id = auth.uid()
          AND cc.id::text = (storage.foldername(name))[2]
      )
      OR EXISTS (
        SELECT 1
        FROM public.coach_conversations cc
        WHERE cc.client_id = auth.uid()
          AND cc.id::text = (storage.foldername(name))[2]
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Revoke anon EXECUTE on helper SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.current_coach_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_assigned_coach(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.protect_profile_role_change() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_fields() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sync_profile_entitlement_source() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sync_profile_plan_delivered() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.validate_plan_activation() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.current_coach_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
-- Trigger functions do not need direct EXECUTE from clients
REVOKE EXECUTE ON FUNCTION public.protect_profile_role_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_fields() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_entitlement_source() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_plan_delivered() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_plan_activation() FROM authenticated;
