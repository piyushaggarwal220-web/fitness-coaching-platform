-- Speed up coach work-queue roster and pending-task lookups.
CREATE INDEX IF NOT EXISTS profiles_coach_id_idx
  ON public.profiles (coach_id)
  WHERE coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS checkins_coach_pending_review_idx
  ON public.checkins (coach_id, submitted_at ASC)
  WHERE reviewed = false;

CREATE INDEX IF NOT EXISTS coach_conversations_coach_unread_idx
  ON public.coach_conversations (coach_id, last_message_at ASC NULLS LAST)
  WHERE unread_by_coach > 0 AND status <> 'closed';

CREATE INDEX IF NOT EXISTS plans_client_undelivered_idx
  ON public.plans (client_id, created_at DESC)
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS issue_reports_client_open_idx
  ON public.issue_reports (client_id, created_at ASC)
  WHERE status IN ('open', 'investigating');
