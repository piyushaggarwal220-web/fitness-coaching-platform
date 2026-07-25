ALTER TABLE public.coach_work_queue_completions
  ADD COLUMN IF NOT EXISTS task_created_at timestamptz;

COMMENT ON COLUMN public.coach_work_queue_completions.task_created_at IS
  'Source timestamp completed by the coach; later activity with the same task id is new work.';
