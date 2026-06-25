# Onboarding System — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded

---

## Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260619000000_add_onboarding_fields.sql` | Adds onboarding columns to `profiles` |
| `src/lib/onboarding.ts` | Options, validation, labels, and `authenticateClient` guard |
| `src/app/onboarding/page.tsx` | 7-step onboarding wizard |

---

## Files Modified

| File | Change |
|---|---|
| `src/types/database.ts` | Extended `Profile`; added `OnboardingProfile` and `OnboardingFormData` |
| `src/lib/coach-utils.ts` | Added new fitness goal labels for onboarding values |
| `src/app/dashboard/page.tsx` | Route protection + onboarding summary card |
| `src/app/profile/page.tsx` | Route protection + updated goal options |
| `src/app/workouts/page.tsx` | Route protection via `authenticateClient` |
| `src/app/progress/page.tsx` | Route protection via `authenticateClient` |

---

## Database Changes

Migration: `supabase/migrations/20260619000000_add_onboarding_fields.sql`

| Column | Type | Default | Purpose |
|---|---|---|---|
| `gender` | `text` | — | Personal info |
| `activity_level` | `text` | — | Sedentary → Very Active |
| `training_experience` | `text` | — | Beginner / Intermediate / Advanced |
| `diet_preference` | `text` | — | Vegetarian, Eggetarian, etc. |
| `injuries` | `text` | — | Optional health notes |
| `medical_notes` | `text` | — | Optional medical notes |
| `sleep_duration` | `text` | — | Sleep range selection |
| `onboarding_complete` | `boolean` | `false` | Completion flag |

**Backfill:** Existing profiles with `age` and `fitness_goal` set are marked `onboarding_complete = true`.

**Apply manually in Supabase SQL editor if migrations are not automated:**

```sql
-- Run contents of supabase/migrations/20260619000000_add_onboarding_fields.sql
```

---

## Route Protection Logic

Implemented in `src/lib/onboarding.ts` → `authenticateClient()`:

```
User visits protected page
        │
        ▼
  Logged in? ──no──► /login
        │
       yes
        │
        ▼
  onboarding_complete = true? ──no──► /onboarding
        │
       yes
        │
        ▼
  Allow page access
```

### Protected routes (require `onboarding_complete = true`)

- `/dashboard`
- `/profile`
- `/workouts`
- `/progress`

### Onboarding route behavior

- Not logged in → `/login`
- Already onboarded → `/dashboard`
- Incomplete → show 7-step wizard

---

## Onboarding Flow

| Step | Section | Fields |
|---|---|---|
| 1 | Personal | Age, gender, height, weight |
| 2 | Goals | Fat Loss, Muscle Gain, Recomposition, Strength, Athletic Performance |
| 3 | Training | Beginner, Intermediate, Advanced |
| 4 | Activity | Sedentary → Very Active |
| 5 | Nutrition | Vegetarian, Eggetarian, Non Vegetarian, Vegan |
| 6 | Health | Injuries, medical notes (optional) |
| 7 | Recovery | Sleep duration |

On submit: upserts `profiles` with all fields and `onboarding_complete = true`, then redirects to `/dashboard`.

---

## Dashboard Integration

`/dashboard` displays an **"Your onboarding profile"** summary card with:

- Goal, training level, activity level, diet, sleep, age/weight

---

## Remaining Limitations

| Limitation | Notes |
|---|---|
| **Client-side guards only** | Redirect happens in `useEffect`; brief flash possible before redirect |
| **No middleware enforcement** | `middleware.ts` does not check `onboarding_complete` |
| **Profile edits don't re-trigger onboarding** | `/profile` can change fields but won't reset completion flag |
| **Migration not auto-applied** | SQL file must be run in Supabase unless CLI migrations are configured |
| **RLS policies not in repo** | Supabase must allow users to upsert their own `profiles` row |
| **Login redirect unchanged** | `/login` still goes to `/dashboard`; onboarding redirect happens on arrival |
| **Coach portal unaffected** | Coach routes do not use onboarding guard |
| **Dashboard stats still mock** | Workout count, streak, and recent activity remain hardcoded |

---

## Build Result

```
✓ Compiled successfully
✓ TypeScript — no errors
✓ 15 routes generated

New route:
  ○ /onboarding
```

**Command:** `npm run build`  
**Exit code:** 0
