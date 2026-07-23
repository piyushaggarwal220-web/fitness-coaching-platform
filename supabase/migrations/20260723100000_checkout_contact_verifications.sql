-- Pre-pay contact verification (email + WhatsApp OTP) for checkout.

CREATE TABLE IF NOT EXISTS public.checkout_contact_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phone_e164 text NOT NULL,
  email_code_hash text,
  phone_code_hash text,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  email_send_count int NOT NULL DEFAULT 0,
  phone_send_count int NOT NULL DEFAULT 0,
  email_attempt_count int NOT NULL DEFAULT 0,
  phone_attempt_count int NOT NULL DEFAULT 0,
  last_email_sent_at timestamptz,
  last_phone_sent_at timestamptz,
  created_ip_hash text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_contact_verifications_email_lower
    CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS checkout_contact_verifications_email_idx
  ON public.checkout_contact_verifications (email);

CREATE INDEX IF NOT EXISTS checkout_contact_verifications_phone_idx
  ON public.checkout_contact_verifications (phone_e164);

CREATE INDEX IF NOT EXISTS checkout_contact_verifications_expires_idx
  ON public.checkout_contact_verifications (expires_at);

ALTER TABLE public.checkout_contact_verifications ENABLE ROW LEVEL SECURITY;

-- Server-only table: no policies for anon/authenticated (service role bypasses RLS).

COMMENT ON TABLE public.checkout_contact_verifications IS
  'Short-lived email + WhatsApp OTP state for Razorpay checkout. Accessed only via service role.';
