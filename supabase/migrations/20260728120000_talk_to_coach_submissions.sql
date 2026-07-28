-- Public "Talk to a coach" form submissions — API-only access (service role).

CREATE TABLE IF NOT EXISTS public.talk_to_coach_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS talk_to_coach_submissions_fingerprint_idx
  ON public.talk_to_coach_submissions (fingerprint);

ALTER TABLE public.talk_to_coach_submissions ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: only trusted server/service-role code may access.
