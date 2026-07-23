-- Enrollment codes: exact membership expiry + member label; access_source enrollment_code

ALTER TABLE redemption_codes
  ADD COLUMN IF NOT EXISTS membership_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS member_label text;

COMMENT ON COLUMN redemption_codes.membership_expires_at IS
  'When redeemed, client subscription_expires_at is set to this exact timestamp.';
COMMENT ON COLUMN redemption_codes.member_label IS
  'Optional label for who this enrollment code is intended for.';
COMMENT ON COLUMN redemption_codes.expires_at IS
  'Optional date after which the code can no longer be redeemed (code redeem-by).';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_access_source_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_access_source_check
  CHECK (access_source IS NULL OR access_source IN ('purchase', 'admin_trial', 'enrollment_code'));

COMMENT ON COLUMN profiles.access_source IS
  'How the client gained access: purchase (Razorpay), enrollment_code (offline/old member), or admin_trial.';
