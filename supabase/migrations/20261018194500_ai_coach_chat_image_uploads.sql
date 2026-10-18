-- Smart Coach uploads photos to <userId>/ai-chat/<stamp>.<ext>.
-- The previous insert policy required the second folder to be a
-- coach_conversations id, so every Smart Coach photo was rejected.

DROP POLICY IF EXISTS "Users upload chat images in their conversations" ON storage.objects;
CREATE POLICY "Users upload chat images in their conversations"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
    AND (
      (storage.foldername(objects.name))[2] = 'ai-chat'
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
