-- Coach-only chat notes (e.g. mid-week AI briefs). Clients must never see these.
ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS coach_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS related_checkin_id uuid
  REFERENCES public.checkins(id) ON DELETE SET NULL;

-- One AI brief per check-in (idempotent regenerate/post).
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_coach_only_checkin_uidx
  ON public.conversation_messages (related_checkin_id)
  WHERE related_checkin_id IS NOT NULL AND coach_only = true;

CREATE INDEX IF NOT EXISTS conversation_messages_coach_only_idx
  ON public.conversation_messages (conversation_id, created_at DESC)
  WHERE coach_only = true;

DROP POLICY IF EXISTS "Clients read own conversation messages" ON public.conversation_messages;

CREATE POLICY "Clients read own conversation messages"
  ON public.conversation_messages FOR SELECT
  USING (
    coach_only = false
    AND EXISTS (
      SELECT 1 FROM public.coach_conversations
      WHERE coach_conversations.id = conversation_messages.conversation_id
        AND coach_conversations.client_id = auth.uid()
    )
  );
