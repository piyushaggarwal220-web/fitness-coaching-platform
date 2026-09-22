-- Pre-pay coaching intake basics (after email verify, before Razorpay).
-- Keyed by checkout_contact_verifications so answers survive magic-link redirects.

CREATE TABLE IF NOT EXISTS public.checkout_intake_basics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.checkout_contact_verifications(id) ON DELETE CASCADE,
  email text NOT NULL,
  plan_slug text NOT NULL,
  age smallint NOT NULL,
  gender text NOT NULL,
  height_cm numeric(5, 1) NOT NULL,
  weight_kg numeric(5, 1),
  diet_preference text NOT NULL,
  main_goal text NOT NULL,
  customer_name text,
  phone_e164 text,
  consumed_at timestamptz,
  consumed_by_user_id uuid,
  nurture_day1_sent_at timestamptz,
  nurture_day2_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_intake_basics_email_lower CHECK (email = lower(email)),
  CONSTRAINT checkout_intake_basics_age_check CHECK (age >= 13 AND age <= 100),
  CONSTRAINT checkout_intake_basics_height_check CHECK (height_cm >= 120 AND height_cm <= 230),
  CONSTRAINT checkout_intake_basics_weight_check CHECK (
    weight_kg IS NULL OR (weight_kg >= 30 AND weight_kg <= 250)
  ),
  CONSTRAINT checkout_intake_basics_diet_check CHECK (
    diet_preference IN ('vegetarian', 'eggetarian', 'non_vegetarian', 'vegan')
  ),
  CONSTRAINT checkout_intake_basics_gender_check CHECK (
    gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say')
  ),
  CONSTRAINT checkout_intake_basics_main_goal_check CHECK (
    main_goal IN ('lose_fat', 'build_muscle', 'both', 'athletic')
  ),
  CONSTRAINT checkout_intake_basics_verification_unique UNIQUE (verification_id)
);

CREATE INDEX IF NOT EXISTS checkout_intake_basics_email_idx
  ON public.checkout_intake_basics (email);

CREATE INDEX IF NOT EXISTS checkout_intake_basics_nurture_idx
  ON public.checkout_intake_basics (created_at)
  WHERE consumed_at IS NULL AND nurture_day2_sent_at IS NULL;

ALTER TABLE public.checkout_intake_basics ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.checkout_intake_basics IS
  'Short-lived pre-pay intake basics. Service role only; merged into profiles on purchase claim.';
