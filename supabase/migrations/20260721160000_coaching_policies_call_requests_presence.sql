-- Durable checkout consent, call-request workflow, chat counters, and presence fallback.

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS terms_policy_version text,
  ADD COLUMN IF NOT EXISTS policy_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS policy_ack_ip_hash text;

CREATE TABLE IF NOT EXISTS public.payment_order_acknowledgements (
  razorpay_order_id text PRIMARY KEY,
  terms_policy_version text NOT NULL,
  refund_policy_version text NOT NULL,
  acknowledged_at timestamptz NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_order_ack_ip_hash_format
    CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.payment_order_acknowledgements ENABLE ROW LEVEL SECURITY;
-- Deliberately no Data API policies: only trusted server/service-role code may access checkout evidence.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE TABLE IF NOT EXISTS public.initial_plan_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'ready', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  draft_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS initial_plan_generation_coach_queue_idx
  ON public.initial_plan_generation_jobs(coach_id, status, queued_at);

ALTER TABLE public.initial_plan_generation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read own initial generation"
  ON public.initial_plan_generation_jobs FOR SELECT TO authenticated
  USING (client_id = auth.uid());
CREATE POLICY "Coaches read assigned initial generation"
  ON public.initial_plan_generation_jobs FOR SELECT TO authenticated
  USING (coach_id = public.current_coach_id());
CREATE POLICY "Admins read initial generation"
  ON public.initial_plan_generation_jobs FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_request_status') THEN
    CREATE TYPE public.call_request_status AS ENUM (
      'requested', 'scheduled', 'completed', 'declined', 'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.call_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  status public.call_request_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz,
  coach_note text,
  updated_by uuid NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_requests_schedule_required
    CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL),
  CONSTRAINT call_requests_resolution_time
    CHECK (
      (status IN ('completed', 'declined', 'cancelled') AND resolved_at IS NOT NULL)
      OR (status IN ('requested', 'scheduled') AND resolved_at IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS call_requests_one_active_per_conversation
  ON public.call_requests(conversation_id)
  WHERE status IN ('requested', 'scheduled');
CREATE INDEX IF NOT EXISTS call_requests_coach_queue_idx
  ON public.call_requests(coach_id, requested_at)
  WHERE status IN ('requested', 'scheduled');

CREATE TABLE IF NOT EXISTS public.call_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_request_id uuid NOT NULL REFERENCES public.call_requests(id) ON DELETE CASCADE,
  from_status public.call_request_status,
  to_status public.call_request_status NOT NULL,
  actor_user_id uuid NOT NULL,
  scheduled_for timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Conversation participants read call requests"
  ON public.call_requests FOR SELECT TO authenticated
  USING (
    client_id = auth.uid()
    OR coach_id = public.current_coach_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "Conversation participants read call request events"
  ON public.call_request_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.call_requests cr
      WHERE cr.id = call_request_events.call_request_id
        AND (
          cr.client_id = auth.uid()
          OR cr.coach_id = public.current_coach_id()
          OR public.is_platform_admin()
        )
    )
  );

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'call_requested';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'call_request_updated';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'initial_plan_draft_ready';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'initial_plan_generation_failed';

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.update_conversation_after_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sender_type = 'client' THEN
    UPDATE public.coach_conversations
    SET unread_by_coach = unread_by_coach + 1,
        last_message_at = NEW.created_at,
        last_message_preview = CASE NEW.message_type
          WHEN 'voice' THEN 'Voice message'
          WHEN 'image' THEN 'Photo'
          ELSE left(coalesce(NEW.content, 'Message'), 120)
        END,
        status = 'active',
        updated_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  ELSIF NEW.sender_type = 'coach' THEN
    UPDATE public.coach_conversations
    SET unread_by_client = unread_by_client + 1,
        last_message_at = NEW.created_at,
        last_message_preview = CASE NEW.message_type
          WHEN 'voice' THEN 'Voice message'
          WHEN 'image' THEN 'Photo'
          ELSE left(coalesce(NEW.content, 'Message'), 120)
        END,
        status = 'active',
        updated_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_message_updates_summary ON public.conversation_messages;
CREATE TRIGGER conversation_message_updates_summary
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION private.update_conversation_after_message();

CREATE OR REPLACE FUNCTION private.recount_conversation_unread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL AND NEW.sender_type = 'client' THEN
    UPDATE public.coach_conversations
    SET unread_by_coach = (
          SELECT count(*) FROM public.conversation_messages
          WHERE conversation_id = NEW.conversation_id
            AND sender_type = 'client'
            AND read_at IS NULL
        ),
        updated_at = now()
    WHERE id = NEW.conversation_id;
  ELSIF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL AND NEW.sender_type = 'coach' THEN
    UPDATE public.coach_conversations
    SET unread_by_client = (
          SELECT count(*) FROM public.conversation_messages
          WHERE conversation_id = NEW.conversation_id
            AND sender_type = 'coach'
            AND read_at IS NULL
        ),
        updated_at = now()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_message_recounts_unread ON public.conversation_messages;
CREATE TRIGGER conversation_message_recounts_unread
  AFTER UPDATE OF read_at ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION private.recount_conversation_unread();

-- Repair any counters that drifted under the previous application-level read/modify/write flow.
UPDATE public.coach_conversations cc
SET unread_by_coach = (
      SELECT count(*) FROM public.conversation_messages cm
      WHERE cm.conversation_id = cc.id
        AND cm.sender_type = 'client'
        AND cm.read_at IS NULL
    ),
    unread_by_client = (
      SELECT count(*) FROM public.conversation_messages cm
      WHERE cm.conversation_id = cc.id
        AND cm.sender_type = 'coach'
        AND cm.read_at IS NULL
    );

DROP POLICY IF EXISTS "Chat participants listen to presence" ON realtime.messages;
CREATE POLICY "Chat participants listen to presence"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'presence'
    AND (SELECT realtime.topic()) ~* '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.coach_conversations cc
      WHERE cc.id = substring((SELECT realtime.topic()) from 6)::uuid
        AND (
          cc.client_id = auth.uid()
          OR cc.coach_id = public.current_coach_id()
        )
    )
  );

DROP POLICY IF EXISTS "Chat participants track presence" ON realtime.messages;
CREATE POLICY "Chat participants track presence"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension = 'presence'
    AND (SELECT realtime.topic()) ~* '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.coach_conversations cc
      WHERE cc.id = substring((SELECT realtime.topic()) from 6)::uuid
        AND (
          cc.client_id = auth.uid()
          OR cc.coach_id = public.current_coach_id()
        )
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_requests;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'initial_plan_generation_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.initial_plan_generation_jobs;
  END IF;
END $$;
