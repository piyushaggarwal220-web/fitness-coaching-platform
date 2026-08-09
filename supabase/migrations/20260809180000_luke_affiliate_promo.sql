-- Affiliate referral code LUKE: public sale (₹999 / ₹1,699 / ₹2,999) + extra 5%.
-- Payable targets: ₹949 / ₹1,614 / ₹2,849 (list MRP minus plan_fixed amounts below).
-- App code hard-codes the sale+5% math; this row enables usage tracking + admin visibility.
-- Team email on use is sent by the app (AFFILIATE_NOTIFY_EMAIL / TALK_TO_COACH_NOTIFY_EMAIL).

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
  referrer_label,
  notes
)
VALUES (
  'LUKE',
  'referral',
  'plan_fixed',
  0,
  0,
  '{"3_months":155000,"6_months":263500,"12_months":465000}'::jsonb,
  ARRAY['3_months', '6_months', '12_months'],
  false,
  100000,
  100000,
  true,
  'Luke',
  'Affiliate code for Luke — sale prices ₹999 / ₹1,699 / ₹2,999 plus an extra 5% (₹949 / ₹1,614 / ₹2,849). Team emailed on each successful checkout use.'
)
ON CONFLICT (code) DO UPDATE SET
  kind = EXCLUDED.kind,
  discount_type = EXCLUDED.discount_type,
  discount_paise = EXCLUDED.discount_paise,
  discount_percent = EXCLUDED.discount_percent,
  plan_discounts_paise = EXCLUDED.plan_discounts_paise,
  applicable_plans = EXCLUDED.applicable_plans,
  first_timer_only = EXCLUDED.first_timer_only,
  is_active = true,
  referrer_label = EXCLUDED.referrer_label,
  notes = EXCLUDED.notes,
  updated_at = now();
