-- Purchases and post-payment onboarding fields

CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  razorpay_payment_id text NOT NULL UNIQUE,
  razorpay_order_id text NOT NULL,
  plan_slug text NOT NULL,
  plan_name text NOT NULL,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'captured',
  customer_email text NOT NULL,
  customer_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchases_user_id_idx ON purchases(user_id);
CREATE INDEX IF NOT EXISTS purchases_created_at_idx ON purchases(created_at DESC);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own purchases"
  ON purchases FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS progress_photo_front text,
  ADD COLUMN IF NOT EXISTS progress_photo_side text,
  ADD COLUMN IF NOT EXISTS progress_photo_back text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Onboarding progress photos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('onboarding-photos', 'onboarding-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Clients can upload onboarding photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'onboarding-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view onboarding photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'onboarding-photos');

CREATE POLICY "Clients can update own onboarding photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'onboarding-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
