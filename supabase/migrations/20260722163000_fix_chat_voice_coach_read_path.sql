-- Fix coach voice playback: unqualified `name` inside the coaches JOIN was
-- resolved to coaches.name, so the conversation-id check never matched the
-- storage object path. createSignedUrl requires SELECT, so coaches could not
-- play client voice notes. Always qualify as objects.name.

DROP POLICY IF EXISTS "Users read voice notes in conversations" ON storage.objects;
CREATE POLICY "Users read voice notes in conversations"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-voice'
    AND (
      auth.uid()::text = (storage.foldername(objects.name))[1]
      OR EXISTS (
        SELECT 1
        FROM public.coach_conversations cc
        JOIN public.coaches c ON c.id = cc.coach_id
        WHERE c.user_id = auth.uid()
          AND cc.id::text = (storage.foldername(objects.name))[2]
      )
      OR EXISTS (
        SELECT 1
        FROM public.coach_conversations cc
        WHERE cc.client_id = auth.uid()
          AND cc.id::text = (storage.foldername(objects.name))[2]
      )
    )
  );
