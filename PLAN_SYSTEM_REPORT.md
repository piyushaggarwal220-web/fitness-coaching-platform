# Coaching Plan Delivery System — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded

---

## Tables Created

### `plans`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `client_id` | `uuid` | FK → `profiles(id)` |
| `coach_id` | `uuid` | FK → `coaches(id)` |
| `title` | `text` | Plan name |
| `phase` | `text` | e.g. "Phase 1 — Fat Loss" |
| `workout_plan` | `text` | Workout content |
| `nutrition_plan` | `text` | Nutrition content |
| `cardio_plan` | `text` | Cardio content |
| `supplement_plan` | `text` | Supplement content |
| `coach_notes` | `text` | Notes visible to client |
| `version` | `integer` | Per-client version number |
| `active` | `boolean` | Only one active per client |
| `delivered_at` | `timestamptz` | Set on activation |
| `updated_at` | `timestamptz` | Auto-updated on save |
| `created_at` | `timestamptz` | Creation timestamp |

**Migration:** `supabase/migrations/20260619200000_create_plans.sql`

**RLS:**
- Clients can read own **active** plans only
- Coaches can SELECT/INSERT/UPDATE/DELETE plans for assigned clients

**Profile flags (`src/lib/plans.ts`):**
- `activatePlan()` → deactivates other plans, activates selected, sets `profiles.plan_delivered = true`
- `deactivatePlan()` → sets `profiles.plan_delivered = false` if no other active plan exists

---

## Routes Created

| Route | Audience | Purpose |
|---|---|---|
| `/plan` | Client | View current active plan (beautiful section layout) |
| `/coach/plans` | Coach | List all plans, filter by client/status |
| `/coach/plan/new` | Coach | Create plan for assigned client |
| `/coach/plan/[id]` | Coach | Edit, duplicate, activate/deactivate, version history |

---

## Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260619200000_create_plans.sql` | Table, indexes, RLS |
| `src/lib/plans.ts` | Validation, activate/deactivate, version helpers |
| `src/components/PlanEditor.tsx` | Shared plan form fields |
| `src/app/plan/page.tsx` | Client plan viewer |
| `src/app/coach/plans/page.tsx` | Coach plan list |
| `src/app/coach/plan/new/page.tsx` | Create plan |
| `src/app/coach/plan/[id]/page.tsx` | Edit & manage plan |

---

## Files Modified

| File | Change |
|---|---|
| `src/types/database.ts` | Added `Plan`, `PlanWithClient`, `PlanFormData`; extended `Profile` with `plan_delivered` |
| `src/app/dashboard/page.tsx` | Coaching plan card with status, version, quick access |
| `src/app/coach/dashboard/page.tsx` | Active plans delivered count + manage link |
| `src/app/components/Navbar.tsx` | Added "My Plan" link |
| `src/app/components/CoachNavbar.tsx` | Added "Plans" link |

---

## Feature Summary

### Coach workflow
1. **Create** (`/coach/plan/new`) — select client, fill sections, optional activate on create
2. **List** (`/coach/plans`) — filter by client and active/inactive
3. **Edit** (`/coach/plan/[id]`) — update all plan sections
4. **Duplicate** — creates new version (inactive) for same client
5. **Activate** — only one active plan per client; updates `plan_delivered`
6. **Version history** — all versions for client listed on detail page

### Client workflow
1. View active plan at `/plan` with styled sections (workout, nutrition, cardio, supplements, notes)
2. Dashboard shows plan title, version, last updated, quick access button

---

## Remaining Limitations

| Limitation | Notes |
|---|---|
| **Migration must be applied manually** | Run SQL in Supabase unless CLI migrations configured |
| **Plain text plans only** | No rich text editor or PDF upload |
| **No client plan history** | Clients only see active plan (RLS restricts to `active = true`) |
| **Requires assigned coach** | Plans link `client_id` + `coach_id`; client must have `profiles.coach_id` set |
| **No email notification** | Client not notified when plan is activated |
| **Version numbering** | Manual duplicate only; no auto-increment on edit |
| **Client-side auth** | No middleware enforcement on `/plan` |

---

## Build Result

```
✓ Compiled successfully
✓ TypeScript — no errors
✓ 20 routes generated

New routes:
  ○ /plan
  ○ /coach/plans
  ○ /coach/plan/new
  ƒ /coach/plan/[id]
```

**Command:** `npm run build`  
**Exit code:** 0
