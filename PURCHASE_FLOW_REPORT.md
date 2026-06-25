# Purchase & Onboarding Flow — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded (26 routes)

---

## Goal

Complete customer journey from landing page → Razorpay payment → account provisioning → onboarding → dashboard.

---

## Workflow

```
Landing (/) → Select plan
     ↓
/checkout?plan={slug} → Name, email, password
     ↓
POST /api/payment/create-order → Razorpay checkout (or TEST_MODE simulate)
     ↓
POST /api/payment/verify → Signature verify, fulfill purchase, create profile
     ↓
Auto sign-in → /onboarding (8 steps incl. photos + terms)
     ↓
/dashboard → Journey status card
```

---

## Files created

| File | Purpose |
|---|---|
| `supabase/migrations/20260619400000_create_purchases_flow.sql` | `purchases` table, profile fields, `onboarding-photos` bucket |
| `src/lib/payments/plans.ts` | Coaching plan catalog (amounts match landing page) |
| `src/lib/payments/razorpay.ts` | Order creation, signature verification, payment fetch |
| `src/lib/payments/fulfillment.ts` | Account + profile + purchase after payment |
| `src/lib/purchase-dashboard.ts` | Dashboard status, delivery timeline, next action |
| `src/app/checkout/page.tsx` | Checkout UI with Razorpay integration |
| `src/app/api/payment/create-order/route.ts` | Create Razorpay order |
| `src/app/api/payment/verify/route.ts` | Verify payment and provision account |

---

## Files modified

| File | Change |
|---|---|
| `src/types/database.ts` | `Purchase` type; profile payment/photo/terms fields |
| `src/lib/onboarding.ts` | 8-step flow, photo upload, payment guard |
| `src/app/onboarding/page.tsx` | Photos, terms, lifestyle/medical steps |
| `src/app/dashboard/page.tsx` | Coaching journey status card |
| `src/app/page.tsx` | Pricing links → `/checkout?plan=...` |
| `src/app/profile/page.tsx` | `requirePayment` guard |
| `src/app/workouts/page.tsx` | `requirePayment` guard |
| `src/app/progress/page.tsx` | `requirePayment` guard |
| `src/app/checkin/page.tsx` | `requirePayment` guard |
| `src/app/plan/page.tsx` | `requirePayment` guard |

---

## Database

### `purchases`

| Column | Notes |
|---|---|
| `razorpay_payment_id` | Unique — idempotent fulfillment |
| `razorpay_order_id` | Razorpay order reference |
| `plan_slug` / `plan_name` | e.g. `6_months` |
| `amount_paise` | INR smallest unit |
| `user_id` | FK → `profiles` |
| `customer_email` / `customer_name` | From checkout |

### `profiles` (new columns)

| Column | Purpose |
|---|---|
| `payment_confirmed` | Set `true` after verified payment |
| `progress_photo_front/side/back` | Onboarding baseline photos |
| `terms_accepted_at` | Terms acceptance timestamp |
| `onboarding_completed_at` | Plan delivery SLA anchor (24h) |

### Storage

- Bucket: `onboarding-photos` (public read, client-scoped upload)

---

## Coaching plans

| Slug | Price | Paise |
|---|---|---|
| `1_month` | ₹500 | 50000 |
| `3_months` | ₹900 | 90000 |
| `6_months` | ₹1,500 | 150000 |
| `12_months` | ₹2,400 | 240000 |

---

## Onboarding steps (8)

1. **Personal** — name, age, gender, height, weight  
2. **Goals** — fitness goal  
3. **Training** — experience level  
4. **Lifestyle** — activity + sleep  
5. **Diet** — preference  
6. **Medical** — injuries + notes  
7. **Photos** — front/side/back → Supabase Storage  
8. **Terms** — acceptance checkbox  

---

## Dashboard status card

Displays:

- Payment confirmed  
- Onboarding complete  
- Coach assigned (when `coach_id` set)  
- Plan status  
- Expected delivery (24h after onboarding if no plan yet)  
- Next action + CTA button  

---

## Environment variables

```env
# Razorpay (production checkout)
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...

# Required for fulfillment + knowledge
SUPABASE_SERVICE_ROLE_KEY=...

# Optional — simulate payments without Razorpay
TEST_MODE=true
NEXT_PUBLIC_TEST_MODE=true
```

---

## Security

- Payment signature verified server-side (HMAC SHA-256)  
- Payment amount + order ID cross-checked via Razorpay API  
- `TEST_MODE` bypasses Razorpay for staging only  
- Client portal routes require `payment_confirmed` (except in test mode)  
- No purchase/plan rows written during payment verify beyond `purchases` + `profiles` upsert  

---

## Before going live

1. Run migration: `supabase/migrations/20260619400000_create_purchases_flow.sql`  
2. Set Razorpay keys in Vercel  
3. Disable `TEST_MODE` on production  
4. Test full flow: landing → checkout → onboarding → dashboard  

---

## Build result

```
npm run build — SUCCESS (exit code 0)
26 routes including /checkout, /api/payment/create-order, /api/payment/verify
```
