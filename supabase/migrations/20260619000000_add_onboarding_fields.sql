-- Add onboarding fields to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS activity_level text,
  ADD COLUMN IF NOT EXISTS training_experience text,
  ADD COLUMN IF NOT EXISTS diet_preference text,
  ADD COLUMN IF NOT EXISTS injuries text,
  ADD COLUMN IF NOT EXISTS medical_notes text,
  ADD COLUMN IF NOT EXISTS sleep_duration text,
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;

-- Backfill: existing profiles with age and fitness_goal are treated as onboarded
UPDATE profiles
SET onboarding_complete = true
WHERE onboarding_complete = false
  AND age IS NOT NULL
  AND fitness_goal IS NOT NULL;
