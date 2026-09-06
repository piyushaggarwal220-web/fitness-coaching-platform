-- Public sale code SUMMER60: 60% off 3 / 6 / 12 month plans.
-- WELCOME60 stays retired in app code. Other public promos are deactivated.

UPDATE public.promo_codes
SET is_active = false, updated_at = now()
WHERE is_active = true
  AND code <> 'SUMMER60';

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
  'SUMMER60',
  'discount',
  'plan_fixed',
  0,
  60,
  '{"3_months":119900,"6_months":209900,"12_months":359900}'::jsonb,
  ARRAY['3_months', '6_months', '12_months'],
  false,
  100000,
  100000,
  true,
  'Public summer sale — 60% off (pay ₹800 / ₹1,400 / ₹2,400). Only public discount code.'
)
ON CONFLICT (code) DO UPDATE SET
  kind = EXCLUDED.kind,
  discount_type = EXCLUDED.discount_type,
  discount_percent = EXCLUDED.discount_percent,
  plan_discounts_paise = EXCLUDED.plan_discounts_paise,
  applicable_plans = EXCLUDED.applicable_plans,
  first_timer_only = false,
  remaining_uses = GREATEST(public.promo_codes.remaining_uses, 100000),
  max_redemptions = GREATEST(public.promo_codes.max_redemptions, 100000),
  is_active = true,
  notes = EXCLUDED.notes,
  updated_at = now();
