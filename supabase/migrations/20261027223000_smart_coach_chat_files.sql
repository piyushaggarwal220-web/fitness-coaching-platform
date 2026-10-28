-- Smart Coach document uploads: <userId>/ai-chat/<stamp>.<ext>
-- Videos are rejected in the app. This bucket holds the other files.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-files', 'chat-files', false, 20971520)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 20971520;

DROP POLICY IF EXISTS "Users upload their smart coach files" ON storage.objects;
CREATE POLICY "Users upload their smart coach files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-files'
    AND auth.uid()::text = (storage.foldername(objects.name))[1]
    AND (storage.foldername(objects.name))[2] = 'ai-chat'
  );

DROP POLICY IF EXISTS "Users read their smart coach files" ON storage.objects;
CREATE POLICY "Users read their smart coach files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND (
      auth.uid()::text = (storage.foldername(objects.name))[1]
      OR public.is_platform_admin()
    )
  );
