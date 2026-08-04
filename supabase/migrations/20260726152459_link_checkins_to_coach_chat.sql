-- Link each generated check-in summary to its source record. This makes chat
-- delivery idempotent and lets a coach's first reply complete a mid-week
-- check-in without creating or reviewing a plan.
ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS source_checkin_id uuid
  REFERENCES public.checkins(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_source_checkin_uidx
  ON public.conversation_messages (source_checkin_id)
  WHERE source_checkin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversation_messages_checkin_reply_lookup_idx
  ON public.conversation_messages (conversation_id, created_at DESC)
  WHERE source_checkin_id IS NOT NULL;
