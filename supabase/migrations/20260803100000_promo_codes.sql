-- Admin-managed checkout promo codes (discount + referral).
-- Separate from enrollment/redemption_codes, which grant membership without payment.

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('discount', 'referral')),
  discount_type text NOT NULL CHECK (discount_type IN ('fixed', 'percent', 'plan_fixed')),
  -- Flat rupee-off in paise (discount_type = 'fixed')
  discount_paise integer NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  -- Percent off 1–90 (discount_type = 'percent')
  discount_percent integer NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 90),
  -- Per-plan paise map, e.g. {"3_months":20000,"6_months":30000} (discount_type = 'plan_fixed')
  plan_discounts_paise jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Optional plan allow-list. NULL / empty = all paid plans (not trial).
  applicable_plans text[] NULL,
  first_timer_only boolean NOT NULL DEFAULT false,
  max_redemptions integer NOT NULL DEFAULT 100 CHECK (max_redemptions >= 1),
  remaining_uses integer NOT NULL CHECK (remaining_uses >= 0),
  expires_at timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  referrer_label text NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_unique UNIQUE (code),
  CONSTRAINT promo_codes_discount_shape CHECK (
    (discount_type = 'fixed' AND discount_paise > 0)
    OR (discount_type = 'percent' AND discount_percent > 0)
    OR (discount_type = 'plan_fixed' AND plan_discounts_paise <> '{}'::jsonb)
  )
);

CREATE INDEX IF NOT EXISTS promo_codes_active_idx
  ON public.promo_codes (is_active, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS public.promo_code_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  purchase_id uuid NULL REFERENCES public.purchases(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  plan_slug text NOT NULL,
  discount_paise integer NOT NULL DEFAULT 0,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promo_code_usages_code_idx
  ON public.promo_code_usages (promo_code_id, used_at DESC);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage promo codes" ON public.promo_codes;
CREATE POLICY "Admins manage promo codes"
  ON public.promo_codes
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins read promo code usages" ON public.promo_code_usages;
CREATE POLICY "Admins read promo code usages"
  ON public.promo_code_usages
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Seed the existing first-timer WELCOME promo so admins can see/edit it.
INSERT INTO public.promo_codes (
  code,
  kind,
  discount_type,
  discount_paise,
  discount_percent,
  plan_discounts_paise,
  applicable_plans,
  first_timer_only,
  max_redemptions,
  remaining_uses,
  is_active,
  notes
)
VALUES (
  'WELCOME',
  'discount',
  'plan_fixed',
  0,
  0,
  '{"3_months":20000,"6_months":30000,"12_months":40000}'::jsonb,
  ARRAY['3_months', '6_months', '12_months'],
  true,
  100000,
  100000,
  true,
  'Default first-timer checkout promo (₹200 / ₹300 / ₹400 by plan).'
)
ON CONFLICT (code) DO NOTHING;
