-- Allow WhatsApp-style replies to a specific message in coach chat.
ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
  REFERENCES public.conversation_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversation_messages_reply_to_idx
  ON public.conversation_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
