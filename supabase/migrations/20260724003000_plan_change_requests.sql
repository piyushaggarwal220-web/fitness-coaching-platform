-- Client-requested diet/workout plan edits (lock-in → background draft → coach review).

CREATE TABLE IF NOT EXISTS public.plan_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  active_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  draft_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  request_text text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('diet', 'workout', 'both')),
  status text NOT NULL DEFAULT 'generating'
    CHECK (status IN (
      'generating',
      'draft_ready',
      'in_review',
      'approved',
      'declined',
      'cancelled',
      'failed'
    )),
  error_message text,
  locked_at timestamptz NOT NULL DEFAULT now(),
  generation_started_at timestamptz,
  draft_ready_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_change_requests_text_len CHECK (char_length(trim(request_text)) BETWEEN 10 AND 4000)
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_change_requests_one_open_per_client
  ON public.plan_change_requests (client_id)
  WHERE status IN ('generating', 'draft_ready', 'in_review');

CREATE INDEX IF NOT EXISTS plan_change_requests_client_locked_idx
  ON public.plan_change_requests (client_id, locked_at DESC);

CREATE INDEX IF NOT EXISTS plan_change_requests_coach_queue_idx
  ON public.plan_change_requests (coach_id, status, locked_at)
  WHERE status IN ('generating', 'draft_ready', 'in_review');

ALTER TABLE public.plan_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read own plan change requests"
  ON public.plan_change_requests FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Coaches read assigned plan change requests"
  ON public.plan_change_requests FOR SELECT TO authenticated
  USING (coach_id = public.current_coach_id());

CREATE POLICY "Admins read plan change requests"
  ON public.plan_change_requests FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Writes go through service-role API routes only (no client INSERT/UPDATE policies).
