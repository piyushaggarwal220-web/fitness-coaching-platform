-- Payment operations, lifecycle delivery idempotency, and refund audit state.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS refund_policy_version text,
  ADD COLUMN IF NOT EXISTS refund_policy_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failure_description text,
  ADD COLUMN IF NOT EXISTS refunded_amount_paise integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS razorpay_refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_purchase_status text,
  ADD COLUMN IF NOT EXISTS meta_purchase_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_purchase_error text;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_refunded_amount_nonnegative;
ALTER TABLE purchases
  ADD CONSTRAINT purchases_refunded_amount_nonnegative
  CHECK (refunded_amount_paise >= 0 AND refunded_amount_paise <= amount_paise);

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_subscription_status_check;
ALTER TABLE purchases
  ADD CONSTRAINT purchases_subscription_status_check
  CHECK (subscription_status IN ('active', 'cancelled', 'refunded'));

CREATE INDEX IF NOT EXISTS purchases_status_created_at_idx
  ON purchases(status, created_at DESC);
CREATE INDEX IF NOT EXISTS purchases_unclaimed_idx
  ON purchases(created_at DESC)
  WHERE status = 'captured' AND claimed_at IS NULL;

CREATE TABLE IF NOT EXISTS lifecycle_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES purchases(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  channel text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_deliveries_target_check CHECK (purchase_id IS NOT NULL OR user_id IS NOT NULL),
  CONSTRAINT lifecycle_deliveries_channel_check CHECK (channel IN ('email', 'whatsapp', 'in_app')),
  CONSTRAINT lifecycle_deliveries_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS lifecycle_deliveries_purchase_idx
  ON lifecycle_deliveries(purchase_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lifecycle_deliveries_user_idx
  ON lifecycle_deliveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lifecycle_deliveries_status_idx
  ON lifecycle_deliveries(status, updated_at DESC);

ALTER TABLE lifecycle_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read lifecycle deliveries"
  ON lifecycle_deliveries FOR SELECT
  USING (public.is_platform_admin());

CREATE TABLE IF NOT EXISTS payment_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  operation_type text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  requested_amount_paise integer,
  no_result_claimed boolean,
  evidence_summary text,
  eligibility_decision text,
  eligibility_due_count integer,
  eligibility_on_time_count integer,
  eligibility_open_window_count integer,
  eligibility_percentage numeric(5,2),
  eligibility_evaluated_at timestamptz,
  razorpay_refund_id text,
  performed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reason text NOT NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT payment_operations_type_check CHECK (operation_type IN ('refund', 'cancel', 'resend_setup', 'retry_meta')),
  CONSTRAINT payment_operations_status_check CHECK (status IN ('pending', 'succeeded', 'failed')),
  CONSTRAINT payment_operations_amount_check CHECK (requested_amount_paise IS NULL OR requested_amount_paise > 0),
  CONSTRAINT payment_operations_eligibility_check
    CHECK (eligibility_decision IS NULL OR eligibility_decision IN ('eligible', 'ineligible', 'pending'))
);

CREATE INDEX IF NOT EXISTS payment_operations_purchase_idx
  ON payment_operations(purchase_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_operations_status_idx
  ON payment_operations(status, created_at DESC);

ALTER TABLE payment_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read payment operations"
  ON payment_operations FOR SELECT
  USING (public.is_platform_admin());

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'onboarding_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'photo_reminder';
