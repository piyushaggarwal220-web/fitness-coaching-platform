-- Consultation form no longer requires email (name + phone + goal only).

ALTER TABLE public.talk_to_coach_submissions
  ALTER COLUMN email DROP NOT NULL;
