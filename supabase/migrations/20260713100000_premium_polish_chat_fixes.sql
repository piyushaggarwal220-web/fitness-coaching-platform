-- Premium polish: chat routing, storage permissions, coach issue visibility

ALTER TABLE coach_conversations
  ADD COLUMN IF NOT EXISTS last_message_preview text;

-- Fix chat image read access for conversation participants
DROP POLICY IF EXISTS "Users read chat images in their conversations" ON storage.objects;
CREATE POLICY "Users read chat images in their conversations"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-images'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM coach_conversations cc
        JOIN coaches c ON c.id = cc.coach_id
        WHERE c.user_id = auth.uid()
          AND cc.id::text = (storage.foldername(name))[2]
      )
      OR EXISTS (
        SELECT 1 FROM coach_conversations cc
        WHERE cc.client_id = auth.uid()
          AND cc.id::text = (storage.foldername(name))[2]
      )
    )
  );

-- Allow clients to upload voice notes (path: userId/conversationId/file)
DROP POLICY IF EXISTS "Coaches upload voice notes" ON storage.objects;
CREATE POLICY "Users upload voice notes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-voice'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Coaches can read issue reports from their assigned clients
CREATE POLICY "Coaches read client issue reports"
  ON issue_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN coaches c ON c.id = p.coach_id
      WHERE p.id = issue_reports.client_id
        AND c.user_id = auth.uid()
    )
  );
