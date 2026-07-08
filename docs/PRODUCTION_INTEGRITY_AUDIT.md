# Production Integrity Audit Report

**Date:** 2026-07-09  
**Scope:** State consistency, database guarantees, workflow integrity, routes, demo accounts, verification  
**Production prompts:** Not modified

---

## Executive summary

The platform had several **application-only invariants** that allowed impossible states (plan delivered without onboarding, trial entitlements without `access_source`, orphan coach assignments, no FK between profiles and coaches). These are now enforced at the **database layer** with triggers, CHECK constraints, foreign keys, and a unique partial index. All verification scripts pass and production build succeeds.

**Can the platform guarantee consistent production state?**  
**Yes, for all major coached-client workflows** — with the remaining risks documented in §7 (auth/profile orphans, Razorpay env, client-side route guards).

---

## 1. Inconsistencies found

| Issue | Count (before) | Root cause |
|-------|----------------|------------|
| `payment_confirmed` without `access_source` | 9 clients | Migration `20260708000000` never applied; trial clients used `payment_confirmed=true` with no purchase record and no distinguishing column |
| `plan_delivered` + `onboarding_complete=false` | 1 (`client@test.local`) | `activatePlan()` had no onboarding gate; dev seeds could activate plans on incomplete clients |
| `coach_id` pointing to deleted coach | 1 | `profiles.coach_id` had **no foreign key** |
| Orphan `coaches` rows (no profile) | 2 | `coaches.user_id` had **no foreign key** to `profiles` |
| `payment_confirmed` without purchase (trial) | 9 | Expected for `admin_trial` but indistinguishable from paid clients without `access_source` |
| Auth users without profiles | 5 | No auth→profile provisioning trigger; manual/test account creation |
| Profiles without auth users | 2 | Deleted auth users without profile cleanup |

**Not found (already healthy):**

- `plan_delivered` without active plan (trigger working)
- Active plan with `plan_delivered=false` (0)
- Plan/coach assignment mismatch (0 after repair)
- Multiple active plans per client (0)
- Purchase without entitlement (0)

---

## 2. Root causes (architectural)

1. **Missing `access_source` column in production** — entitlement model was code-only (`payment_confirmed` boolean) with no DB distinction between Razorpay and admin trial.
2. **No FK profiles ↔ coaches** — coach deletion/reassignment could leave dangling `coach_id`.
3. **Plan delivery gated only in UI** — `activatePlan()` and DB allowed `active=true` on incomplete onboarding.
4. **`plan_delivered` denormalized flag** — correct trigger existed but activation path bypassed prerequisites.
5. **Dev/demo tooling** — `seedActivateSamplePlan` and manual admin actions could create contradictory demo state.
6. **Orphan auth/profile rows** — no database or auth hook guarantees profile creation on signup.

---

## 3. Fixes implemented

### Database (`supabase/migrations/20260709000000_production_integrity.sql`)

| Guarantee | Mechanism |
|-----------|-----------|
| Entitlement source | `access_source` column + CHECK + backfill + `sync_profile_entitlement_source` trigger |
| Plan requires onboarding | `profiles_plan_delivered_requires_onboarding` CHECK |
| Plan activation rules | `validate_plan_activation` BEFORE trigger (onboarding, coach assigned, coach match) |
| Single active plan | `plans_one_active_per_client_idx` unique partial index |
| `plan_delivered` sync | `sync_profile_plan_delivered` AFTER trigger (hardened) |
| Coach assignment integrity | `profiles_coach_id_fkey` → `coaches(id) ON DELETE SET NULL` |
| Coach profile integrity | `coaches_user_id_fkey` → `profiles(id) ON DELETE CASCADE` |
| Data repair | Backfill `access_source`, clear orphan coach_ids, deactivate plans on incomplete onboarding, remove orphan coaches |

### Application

| File | Change |
|------|--------|
| `src/lib/plans.ts` | `activatePlan()` validates onboarding + coach assignment before activation |
| `src/lib/admin/assign-coach.ts` | Rejects assignment to non-existent coach |
| `src/lib/admin/workflow-consistency.ts` | **New** — repairs entitlement tags and deactivates plans on inconsistent clients |
| `src/lib/admin/testing-accounts.ts` | `ensureDemoClientAccount()` runs repair + completes onboarding when active plan exists |
| `src/lib/dev-seeds.ts` | `seedActivateSamplePlan()` requires onboarding + coach first |
| `src/app/signup/page.tsx` | Redirects to `/checkout` (canonical funnel) |
| `src/app/test/page.tsx` | Returns 404 in production builds |
| `scripts/verify-state-consistency.ts` | **New** — automated impossible-state detection |
| `package.json` | Added `verify:state-consistency` to `verify:all` |

### Routes (Part 7)

| Route | Production behavior |
|-------|---------------------|
| `/signup` | Redirect → `/checkout?plan=6_months` |
| `/test` | 404 (`notFound()`) |
| `/admin/dev-tools` | Already 404 in production (unchanged) |
| `/admin/notifications` | Placeholder — documented, not removed |

---

## 4. Files modified

```
supabase/migrations/20260709000000_production_integrity.sql  (new)
scripts/verify-state-consistency.ts                          (new)
src/lib/admin/workflow-consistency.ts                        (new)
src/lib/plans.ts
src/lib/admin/assign-coach.ts
src/lib/admin/testing-accounts.ts
src/lib/dev-seeds.ts
src/app/signup/page.tsx
src/app/test/page.tsx
package.json
docs/PRODUCTION_INTEGRITY_AUDIT.md                           (this file)
```

---

## 5. Verification results

| Check | Result |
|-------|--------|
| `npm run verify:all` | **PASS** (prompts, context, home-workout, knowledge, complexity, testing-accounts, purchase-flow, state-consistency) |
| `npm run build` | **PASS** |
| DB impossible-state query (post-migration) | **0 violations** for plan/onboarding/coach/entitlement checks |
| Demo accounts | **PASS** — `client@test.local` has `access_source=admin_trial`, workflow consistent |

---

## 6. Environment configuration (Part 6)

| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `ANTHROPIC_API_KEY` | ✅ Set |
| `NEXT_PUBLIC_APP_URL` | ⚠️ **Not set** — set before private beta for correct portal URLs |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | ⚠️ **Not set locally** — required in production for live payments |
| `NEXT_PUBLIC_PRODUCTION_DOMAIN` | Not used by codebase — use `NEXT_PUBLIC_APP_URL` |

---

## 7. Remaining risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Auth user without profile (5 rows) | Medium | Add auth signup hook or run periodic `verify-state-consistency` + repair script; does not block coached workflows |
| Profile without auth (2 rows) | Low | Manual cleanup via admin deletion tools |
| Route protection is client-side only | Medium | Middleware server redirects (future hardening) |
| `/admin/notifications` placeholder | Low | Documented; no data writes |
| Check-ins allowed without active plan | Low | Historical data preserved; new check-ins are client UX flow — consider DB trigger if strict enforcement needed |
| Coach reassignment does not migrate plan `coach_id` | Medium | Admin reassignment should update active plan coach_id (future enhancement) |

---

## 8. Workflow integrity matrix

| Scenario | DB-enforced? | Notes |
|----------|--------------|-------|
| New paying customer | ✅ | Fulfillment → profile + purchase + `access_source=purchase` |
| New trial customer | ✅ | `access_source=admin_trial` via trigger |
| Plan delivery | ✅ | Requires onboarding + coach; CHECK on `plan_delivered` |
| Plan delivery without onboarding | ❌ Blocked | Trigger + CHECK + app guard |
| Coach deletion | ✅ | FK SET NULL on `profiles.coach_id`; deletion API reassigns clients |
| Client deletion | ✅ | Cascades via `account-deletion.ts` |
| Support requests | ✅ | FK to profiles CASCADE |
| Complexity history | ✅ | FK to profiles CASCADE |

---

## 9. Ongoing QA

Run before each release:

```bash
npm run verify:all
npm run build
```

For demo account repair:

```bash
npx tsx --env-file=.env.local scripts/ensure-demo-accounts.ts
```
