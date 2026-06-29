-- Flexible coaching intake stored as JSON; resume step for partial onboarding
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_data jsonb;

COMMENT ON COLUMN profiles.onboarding_data IS
  'Extended coaching intake (goals, lifestyle, training, diet, eating pattern, supplements). Resume step stored in onboarding_data.resumeStep.';
