-- Coach-only planner chat, one thread per client.
-- Client plan edits from the member AI chat wait here instead of publishing themselves.

CREATE TABLE IF NOT EXISTS public.client_planner_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('coach', 'assistant', 'summary', 'request')),
  content text NOT NULL,
  token_estimate integer NOT NULL DEFAULT 0,
  plan_change_request_id uuid REFERENCES public.plan_change_requests(id) ON DELETE SET NULL,
  published_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_planner_messages_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS client_planner_messages_client_created_idx
  ON public.client_planner_messages (client_id, created_at);

ALTER TABLE public.client_planner_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches read own client planner messages"
  ON public.client_planner_messages FOR SELECT TO authenticated
  USING (coach_id = public.current_coach_id());

CREATE POLICY "Admins read client planner messages"
  ON public.client_planner_messages FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Writes stay on the service-role planner API.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'plan_change_requests'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.plan_change_requests DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.plan_change_requests
  ADD CONSTRAINT plan_change_requests_status_check
  CHECK (status IN (
    'generating',
    'draft_ready',
    'in_review',
    'approved',
    'declined',
    'cancelled',
    'failed',
    'awaiting_planner'
  ));

DROP INDEX IF EXISTS public.plan_change_requests_one_open_per_client;

CREATE UNIQUE INDEX plan_change_requests_one_open_per_client
  ON public.plan_change_requests (client_id)
  WHERE status IN ('generating', 'draft_ready', 'in_review', 'awaiting_planner');

DROP INDEX IF EXISTS public.plan_change_requests_coach_queue_idx;

CREATE INDEX plan_change_requests_coach_queue_idx
  ON public.plan_change_requests (coach_id, status, locked_at)
  WHERE status IN ('generating', 'draft_ready', 'in_review', 'awaiting_planner');
