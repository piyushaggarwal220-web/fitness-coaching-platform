ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS workout_difficulty text;

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_workout_difficulty_check;

ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_workout_difficulty_check
  CHECK (
    workout_difficulty IS NULL
    OR workout_difficulty IN ('keep', 'easier', 'moderate', 'hard')
  );

COMMENT ON COLUMN public.checkins.workout_difficulty IS
  'Sunday check-in choice: keep, easier, moderate, or hard. There is no mixed gym-and-home option.';
