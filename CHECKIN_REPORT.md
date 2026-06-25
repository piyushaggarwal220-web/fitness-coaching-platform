# Weekly Check-In System — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded

---

## Tables Created

### `checkins`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `client_id` | `uuid` | FK → `profiles(id)` |
| `coach_id` | `uuid` | FK → `coaches(id)` |
| `submitted_at` | `timestamptz` | Default `now()` |
| `weight` | `numeric` | kg |
| `waist` | `numeric` | cm |
| `progress_photo_front` | `text` | Storage URL |
| `progress_photo_side` | `text` | Storage URL |
| `progress_photo_back` | `text` | Storage URL |
| `energy_level` | `integer` | 1–10 |
| `hunger_level` | `integer` | 1–10 |
| `training_performance` | `integer` | 1–10 |
| `adherence_score` | `integer` | 1–10 |
| `notes` | `text` | Optional client notes |
| `coach_response` | `text` | JSON: feedback + action items |
| `reviewed` | `boolean` | Default `false` |
| `reviewed_at` | `timestamptz` | Set on coach review |

**Migration:** `supabase/migrations/20260619100000_create_checkins.sql`

Also creates:
- RLS policies for clients (insert/read own) and coaches (read/update assigned)
- `checkin-photos` storage bucket with upload/read policies

---

## Routes Created

| Route | Audience | Purpose |
|---|---|---|
| `/checkin` | Client | Weekly submission form with photos |
| `/coach/checkins` | Coach | Pending/reviewed list, client filter, newest first |
| `/coach/checkin/[id]` | Coach | Review detail, feedback, mark reviewed |

---

## Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260619100000_create_checkins.sql` | Table, indexes, RLS, storage bucket |
| `src/lib/checkin.ts` | Validation, photo upload, date/change formatters |
| `src/app/checkin/page.tsx` | Client weekly check-in form |
| `src/app/coach/checkins/page.tsx` | Coach check-in queue |
| `src/app/coach/checkin/[id]/page.tsx` | Coach review detail page |

---

## Files Modified

| File | Change |
|---|---|
| `src/types/database.ts` | Added `Checkin`, `CheckinFormData`, `CoachCheckinResponse`; extended `Profile` |
| `src/app/dashboard/page.tsx` | Check-in status card, next reminder, quick action |
| `src/app/coach/dashboard/page.tsx` | Pending review count + link to check-ins |
| `src/app/components/Navbar.tsx` | Added "Check-In" link |
| `src/app/components/CoachNavbar.tsx` | Added "Check-ins" link |

---

## Flow Summary

### Client submission (`/checkin`)

1. Authenticated client with completed onboarding
2. Validates weight, waist, scores (1–10), and 3 photos
3. Uploads photos to `checkin-photos` bucket
4. Inserts row into `checkins`
5. Sets `profiles.checkin_awaiting = true`

### Coach review (`/coach/checkin/[id]`)

1. Coach views client info, measurements vs previous check-in, photos, scores, notes
2. Enters feedback (required) and action items
3. Sets `reviewed = true`, `reviewed_at`, saves `coach_response` as JSON
4. Sets `profiles.checkin_awaiting = false`

### Dashboard integration

**Client `/dashboard`:**
- Latest check-in status
- Next check-in due date (7-day interval)
- Button to submit check-in

**Coach `/coach/dashboard`:**
- Pending review count from `checkins` table
- "Review check-ins" button → `/coach/checkins`

---

## Remaining Limitations

| Limitation | Notes |
|---|---|
| **Migration must be applied manually** | Run SQL in Supabase unless CLI migrations are configured |
| **Requires `coach_id` on profile** | Clients without assigned coach cannot submit |
| **No duplicate check-in prevention** | Client can submit multiple check-ins per week |
| **`checkin_overdue` not auto-set** | Only cleared on submit; overdue flag not scheduled |
| **Storage bucket must exist** | Migration creates bucket; verify in Supabase dashboard |
| **Client-side auth only** | No middleware enforcement on `/checkin` |
| **Coach response not visible to client yet** | No client UI to read feedback from coach |
| **Photo size limits** | No client-side compression; large files may fail upload |

---

## Build Result

```
✓ Compiled successfully
✓ TypeScript — no errors
✓ 17 routes generated

New routes:
  ○ /checkin
  ○ /coach/checkins
  ƒ /coach/checkin/[id]
```

**Command:** `npm run build`  
**Exit code:** 0
