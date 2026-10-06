-- Client choice for next week's workout split structure (weekly check-ins).
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS workout_split_preference text;

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_workout_split_preference_check;

ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_workout_split_preference_check
  CHECK (
    workout_split_preference IS NULL
    OR workout_split_preference IN (
      'keep',
      'change_system',
      'full_body',
      'upper_lower',
      'ppl'
    )
  );

COMMENT ON COLUMN public.checkins.workout_split_preference IS
  'Weekly check-in: keep current split, change_system (system decides), or a named split.';
