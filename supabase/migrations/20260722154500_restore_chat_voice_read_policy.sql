-- chat-voice was privatized in harden_security_entitlements_storage without
-- restoring a SELECT policy. createSignedUrl requires SELECT, so playback
-- failed for both coaches and clients even though uploads still worked.

DROP POLICY IF EXISTS "Users read voice notes in conversations" ON storage.objects;
CREATE POLICY "Users read voice notes in conversations"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-voice'
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
