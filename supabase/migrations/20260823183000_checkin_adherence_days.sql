-- Days the client actually followed each habit (0–7 for weekly, 0–3 for mid-week).
ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS days_followed_diet smallint,
  ADD COLUMN IF NOT EXISTS days_followed_workout smallint,
  ADD COLUMN IF NOT EXISTS days_followed_sleep smallint,
  ADD COLUMN IF NOT EXISTS days_followed_water smallint,
  ADD COLUMN IF NOT EXISTS days_followed_steps smallint;

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_days_followed_diet_range;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_days_followed_diet_range
  CHECK (days_followed_diet IS NULL OR (days_followed_diet >= 0 AND days_followed_diet <= 7));

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_days_followed_workout_range;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_days_followed_workout_range
  CHECK (days_followed_workout IS NULL OR (days_followed_workout >= 0 AND days_followed_workout <= 7));

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_days_followed_sleep_range;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_days_followed_sleep_range
  CHECK (days_followed_sleep IS NULL OR (days_followed_sleep >= 0 AND days_followed_sleep <= 7));

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_days_followed_water_range;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_days_followed_water_range
  CHECK (days_followed_water IS NULL OR (days_followed_water >= 0 AND days_followed_water <= 7));

ALTER TABLE public.checkins
  DROP CONSTRAINT IF EXISTS checkins_days_followed_steps_range;
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_days_followed_steps_range
  CHECK (days_followed_steps IS NULL OR (days_followed_steps >= 0 AND days_followed_steps <= 7));
