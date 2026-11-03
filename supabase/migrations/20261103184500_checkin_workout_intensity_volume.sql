ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS workout_intensity text,
  ADD COLUMN IF NOT EXISTS workout_volume text;

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_workout_intensity_check;

ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_workout_intensity_check
  CHECK (
    workout_intensity IS NULL
    OR workout_intensity IN ('decide', 'comfortable', 'solid', 'tough')
  );

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_workout_volume_check;

ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_workout_volume_check
  CHECK (
    workout_volume IS NULL
    OR workout_volume IN ('decide', 'shorter', 'usual', 'fuller')
  );

COMMENT ON COLUMN public.checkins.workout_intensity IS
  'Optional Sunday choice for how hard each set feels: decide, comfortable, solid, or tough.';

COMMENT ON COLUMN public.checkins.workout_volume IS
  'Optional Sunday choice for how many sets: decide, shorter, usual, or fuller.';
