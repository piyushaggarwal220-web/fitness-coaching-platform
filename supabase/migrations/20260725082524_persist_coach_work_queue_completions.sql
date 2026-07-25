-- Coach-confirmed queue completions are durable across browsers, refreshes,
-- realtime refreshes, and tasks whose source record can remain open.
CREATE TABLE IF NOT EXISTS public.coach_work_queue_completions (
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  task_type text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, task_id)
);

CREATE INDEX IF NOT EXISTS coach_work_queue_completions_completed_at_idx
  ON public.coach_work_queue_completions (coach_id, completed_at DESC);

ALTER TABLE public.coach_work_queue_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches read own queue completions"
  ON public.coach_work_queue_completions
  FOR SELECT
  TO authenticated
  USING (coach_id = public.current_coach_id());

COMMENT ON TABLE public.coach_work_queue_completions IS
  'Durable record of work-queue tasks explicitly marked completed by a coach. Writes use service-role API routes.';
