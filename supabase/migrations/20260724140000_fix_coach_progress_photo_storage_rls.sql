-- Fix coach progress-photo SELECT: unqualified `name` inside EXISTS
-- resolved to profiles.name, so createSignedUrl always failed for coaches.
-- Same bug class as 20260722163000_fix_chat_voice_coach_read_path.sql.

DROP POLICY IF EXISTS "Assigned coaches read checkin photos" ON storage.objects;
CREATE POLICY "Assigned coaches read checkin photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id::text = (storage.foldername(objects.name))[1]
        AND p.coach_id = public.current_coach_id()
    )
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
      WHERE p.id::text = (storage.foldername(objects.name))[1]
        AND p.coach_id = public.current_coach_id()
    )
  );

-- Coaches can resolve client issue reports from the work queue
DROP POLICY IF EXISTS "Coaches update client issue reports" ON public.issue_reports;
CREATE POLICY "Coaches update client issue reports"
  ON public.issue_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = issue_reports.client_id
        AND p.coach_id = public.current_coach_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = issue_reports.client_id
        AND p.coach_id = public.current_coach_id()
    )
  );
