-- Trial / admin-granted client access (bypasses Razorpay while preserving audit trail)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS access_source text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_access_source_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_access_source_check
  CHECK (access_source IS NULL OR access_source IN ('purchase', 'admin_trial'));

COMMENT ON COLUMN profiles.access_source IS
  'How platform access was granted: purchase (Razorpay) or admin_trial (internal QA/demo).';

CREATE INDEX IF NOT EXISTS profiles_access_source_idx ON profiles(access_source)
  WHERE access_source IS NOT NULL;
