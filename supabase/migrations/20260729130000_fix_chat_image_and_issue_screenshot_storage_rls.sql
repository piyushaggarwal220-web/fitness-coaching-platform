-- Photo uploads failed with "new row violates row-level security policy" because
-- two private buckets never got INSERT policies:
--   * chat-images       (client/coach photo sharing in chat)
--   * issue-screenshots (client "report an issue" attachments)
-- Also fixes the chat-images coach read path: unqualified `name` inside the
-- coaches JOIN resolved to coaches.name, so the conversation-id check never
-- matched (same bug already fixed for chat-voice).

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', false),
       ('issue-screenshots', 'issue-screenshots', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public = false
WHERE id IN ('chat-images', 'issue-screenshots');

-- ---------------------------------------------------------------------------
-- chat-images: path = <uploaderUserId>/<conversationId>/<timestamp>_<name>
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users upload chat images in their conversations" ON storage.objects;
CREATE POLICY "Users upload chat images in their conversations"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
    AND EXISTS (
      SELECT 1
      FROM public.coach_conversations cc
      WHERE cc.id::text = (storage.foldername(objects.name))[2]
        AND (
          cc.client_id = auth.uid()
          OR cc.coach_id = public.current_coach_id()
        )
    )
  );

DROP POLICY IF EXISTS "Users read chat images in their conversations" ON storage.objects;
CREATE POLICY "Users read chat images in their conversations"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (
      auth.uid()::text = (storage.foldername(objects.name))[1]
      OR EXISTS (
        SELECT 1
        FROM public.coach_conversations cc
        WHERE cc.id::text = (storage.foldername(objects.name))[2]
          AND (
            cc.client_id = auth.uid()
            OR cc.coach_id = public.current_coach_id()
          )
      )
    )
  );

DROP POLICY IF EXISTS "Admins read chat images" ON storage.objects;
CREATE POLICY "Admins read chat images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- issue-screenshots: path = <clientId>/<timestamp>_<filename>
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients upload own issue screenshots" ON storage.objects;
CREATE POLICY "Clients upload own issue screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'issue-screenshots'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
  );

DROP POLICY IF EXISTS "Owners read issue screenshots" ON storage.objects;
CREATE POLICY "Owners read issue screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'issue-screenshots'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
  );

DROP POLICY IF EXISTS "Assigned coaches read issue screenshots" ON storage.objects;
CREATE POLICY "Assigned coaches read issue screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'issue-screenshots'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id::text = (storage.foldername(objects.name))[1]
        AND p.coach_id = public.current_coach_id()
    )
  );

DROP POLICY IF EXISTS "Admins read issue screenshots" ON storage.objects;
CREATE POLICY "Admins read issue screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'issue-screenshots'
    AND public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Legacy onboarding/checkin policies were created without a role target, so
-- they also applied to `anon`. Scope them to authenticated.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients can upload onboarding photos" ON storage.objects;
DROP POLICY IF EXISTS "Clients can update own onboarding photos" ON storage.objects;

DROP POLICY IF EXISTS "Clients can upload checkin photos" ON storage.objects;
CREATE POLICY "Clients can upload checkin photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'checkin-photos'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
  );

DROP POLICY IF EXISTS "Clients can update own checkin photos" ON storage.objects;
CREATE POLICY "Clients can update own checkin photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
  )
  WITH CHECK (
    bucket_id = 'checkin-photos'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
  );

DROP POLICY IF EXISTS "Users upload voice notes" ON storage.objects;
CREATE POLICY "Users upload voice notes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-voice'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
  );
