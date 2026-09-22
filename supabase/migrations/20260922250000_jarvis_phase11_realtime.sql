-- Jarvis Phase 11: Realtime voice sessions (transport metadata only — no raw audio)

CREATE TABLE IF NOT EXISTS public.jarvis_realtime_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.jarvis_conversations(id) ON DELETE SET NULL,
  admin_user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'openai',
  model text,
  status text NOT NULL DEFAULT 'CREATED'
    CHECK (status IN (
      'CREATED', 'CONNECTING', 'CONNECTED', 'LISTENING', 'PROCESSING',
      'WAITING_APPROVAL', 'SPEAKING', 'INTERRUPTED', 'DISCONNECTED', 'ERROR', 'CLOSED'
    )),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  audio_input_seconds double precision NOT NULL DEFAULT 0,
  audio_output_seconds double precision NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  termination_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_realtime_sessions_admin_idx
  ON public.jarvis_realtime_sessions(admin_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS jarvis_realtime_sessions_status_idx
  ON public.jarvis_realtime_sessions(status)
  WHERE status <> 'CLOSED';

CREATE INDEX IF NOT EXISTS jarvis_realtime_sessions_conversation_idx
  ON public.jarvis_realtime_sessions(conversation_id)
  WHERE conversation_id IS NOT NULL;

ALTER TABLE public.jarvis_realtime_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read jarvis_realtime_sessions" ON public.jarvis_realtime_sessions;
CREATE POLICY "Admins read jarvis_realtime_sessions"
  ON public.jarvis_realtime_sessions FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins write jarvis_realtime_sessions" ON public.jarvis_realtime_sessions;
CREATE POLICY "Admins write jarvis_realtime_sessions"
  ON public.jarvis_realtime_sessions FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
