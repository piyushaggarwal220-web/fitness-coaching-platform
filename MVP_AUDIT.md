# MVP Audit — Coaching Platform

**Audit date:** June 19, 2026  
**Stack:** Next.js 16.2.9 (App Router) · React 19 · Supabase · Vercel  
**Scope:** Full codebase review — no code changes made during this audit.

---

## Executive Summary

The project is a **dual-portal fitness coaching platform** with a polished marketing landing page, basic client auth/portal features, and a partial coach portal. Core infrastructure (build, deploy, Supabase auth) is in place, but **several features promised on the landing page and in the coach UI are not implemented**. Payment, onboarding, check-ins, and coach–client workflows are the largest gaps before accepting a first paying customer.

---

## 1. Working Features

| Feature | Route / Location | Notes |
|---|---|---|
| Marketing landing page | `/` | Full static page: hero, pricing cards, testimonials, FAQ, WhatsApp CTA, Razorpay payment links |
| Client signup | `/signup` | Supabase `signUp` with email/password |
| Client login | `/login` | Supabase `signInWithPassword`, redirects to `/dashboard` |
| Coach login | `/coach/login` | Auth + `coaches` table lookup; non-coaches are signed out |
| Client dashboard shell | `/dashboard` | Auth gate, loads profile name/email, quick-action navigation |
| Profile management | `/profile` | Load + upsert to `profiles` (name, age, goal, weight, height) |
| Workout logging | `/workouts` | Create and list workouts from `workouts` table |
| Progress overview | `/progress` | Aggregated stats + recent workout list from real data |
| Coach dashboard | `/coach/dashboard` | Loads coach record + assigned clients; stats from `profiles` flags |
| Client navbar | `Navbar.tsx` | Auth-aware links, mobile menu, logout |
| Coach navbar | `CoachNavbar.tsx` | Dashboard link, logout |
| Session refresh middleware | `middleware.ts` | Refreshes Supabase session on each matched request |
| Production build | `npm run build` | All 11 app routes compile and prerender |
| TypeScript types | `src/types/database.ts` | Shared types for Coach, Profile, Workout, etc. |
| Dev test page | `/test` | Client component with interactive button |

---

## 2. Incomplete Features

| Feature | Current State | Gap |
|---|---|---|
| **Coach client list page** | Nav link exists (`/coach/clients`) | **No page built** — link returns 404 |
| **Coach client detail** | "View Profile" button on dashboard | Routes to `/coach/client/[id]` — **no page exists** |
| **Weekly check-ins** | Promised on landing page + FAQ; coach dashboard reads `checkin_awaiting`, `checkin_overdue` | **No check-in submission UI** for clients; flags must be set manually in DB |
| **Plan delivery** | Coach dashboard reads `plan_delivered` | **No plan upload/delivery flow** in the app |
| **Payment → account activation** | FAQ: "redirected to WhatsApp to activate" after Razorpay | Razorpay links on landing page only; **no webhook, no subscription table, no auto-provisioning** |
| **Coach assignment** | Clients filtered by `profiles.coach_id` | **No UI to assign clients to coaches** |
| **Signup onboarding** | Signup creates auth user only | **No automatic `profiles` row**; user must visit `/profile` manually |
| **Password reset** | — | Not implemented |
| **Email verification** | — | No UI flow |
| **Server-side route protection** | Middleware only refreshes session | Protected pages rely on **client-side** `useEffect` redirects |
| **Centralized Supabase clients** | `src/lib/supabase/client.ts` + `server.ts` exist | **Not imported anywhere**; each page creates its own `createClient` |
| **Charts / analytics** | `chart.js`, `react-chartjs-2` in `package.json` | **Not used** in any page |
| **Email (Resend)** | Dependency installed | **Not used** |
| **Background jobs (Inngest)** | Dependency installed | **Not used** |
| **Validation (Zod)** | Dependency installed | **Not used** |
| **Database migrations** | — | **No SQL/migration files in repo**; schema assumed to exist in Supabase |
| **RLS / security policies** | — | Not documented or version-controlled in this repo |

---

## 3. Broken Features

| Issue | Location | Impact |
|---|---|---|
| **Missing before/after images** | `/` references `/before.jpg`, `/after.jpg` | Images **not in `public/`** — broken image placeholders on landing page |
| **Dead nav link: Coach Clients** | `CoachNavbar.tsx` → `/coach/clients` | **404** |
| **Dead button: View Profile** | `/coach/dashboard` → `/coach/client/[id]` | **404** |
| **Workout insert type mismatch risk** | `/workouts` | `duration` submitted as string; may fail if DB column expects `integer` (no error shown to user on failure) |
| **Duplicate Supabase client pattern** | All auth pages | Module-level `createClient('')` **fails at build** if env vars missing on Vercel (mitigated once env is set, but fragile) |
| **Orphan file** | `src/app/coach/login/Untitled` | Duplicate/accidental file in repo |

### Conditionally broken (depends on Supabase setup)

These features work in code but **will fail at runtime** if the corresponding tables, columns, or RLS policies are missing in Supabase:

- `profiles` upsert on `/profile`
- `workouts` insert/select
- `coaches` lookup on coach login
- Coach dashboard client queue (`profiles.coach_id`, `checkin_*`, `plan_delivered` columns)

---

## 4. Database Tables Implemented (in code)

No migration files exist in the repository. The following tables/columns are **referenced in application code**:

### `profiles`

| Column (inferred) | Used by |
|---|---|
| `id` | profile, dashboard, coach dashboard (FK to auth user) |
| `name` | profile, dashboard, coach dashboard |
| `email` | coach dashboard (client display) |
| `age` | profile |
| `fitness_goal` | profile |
| `weight` | profile |
| `height` | profile |
| `coach_id` | coach dashboard (client assignment) |
| `checkin_awaiting` | coach dashboard stats/badges |
| `checkin_overdue` | coach dashboard stats/badges |
| `plan_delivered` | coach dashboard stats/badges |
| `updated_at` | profile upsert |

### `coaches`

| Column (inferred) | Used by |
|---|---|
| `id` | coach dashboard (client query) |
| `user_id` | coach login, coach dashboard auth |
| `name` | coach dashboard welcome |
| `hard_cap` | coach dashboard capacity display |

### `workouts`

| Column (inferred) | Used by |
|---|---|
| `id` | workouts, progress |
| `user_id` | workouts, progress |
| `name` | workouts, progress |
| `duration` | workouts, progress |
| `calories` | workouts, progress |
| `created_at` | workouts, progress |
| `date` | workouts insert (form field) |

### Not used in current code

- `users` table with `role` (was in an earlier middleware design, not in current `middleware.ts`)
- Subscriptions, payments, check-ins, plans, or messages tables

---

## 5. Authentication Status

| Area | Status |
|---|---|
| **Provider** | Supabase Auth (email + password) |
| **Client auth** | ✅ Login + signup pages functional |
| **Coach auth** | ✅ Separate login; validates `coaches` row |
| **Session handling** | ⚠️ Middleware refreshes session via cookies; pages use **direct `@supabase/supabase-js`** (not `@supabase/ssr` browser client) |
| **SSR auth helpers** | ❌ `src/lib/supabase/server.ts` and `client.ts` exist but are **unused** |
| **Route protection** | ⚠️ **Client-side only** — unauthenticated users briefly see loading state; no server redirect |
| **Role-based access** | ⚠️ Coach vs client enforced per-page in `useEffect`, not in middleware |
| **Post-signup flow** | ❌ No profile creation trigger; no coach/client role assignment |
| **Password reset / verify email** | ❌ Not implemented |
| **Logout** | ✅ Works via `signOut()` in navbars |

---

## 6. Pages That Still Contain Mock / Static Data

| Page | Mock / static content |
|---|---|
| **`/dashboard`** | **Hardcoded stats:** `workouts: 12`, `streak: 5`, `progress: 78%`. **Hardcoded recent activity:** "Completed workout - Upper Body (2 hours ago)", "Updated profile (1 day ago)" — not from database |
| **`/` (landing)** | **Marketing stats:** "6,000+ clients coached", "2x weekly check-ins". **Testimonials:** 6 static quotes with fabricated names. **Pricing:** static array with Razorpay links (real links, but no backend integration). **FAQ answers** describe features (check-ins, portal) not fully built |
| **`/coach/dashboard`** | `hard_cap` fallback defaults to **500** if null in DB |
| **`/test`** | Dev-only test button (not production feature) |

### Pages using real Supabase data (when DB is configured)

- `/profile` — live profile read/write
- `/workouts` — live workout CRUD
- `/progress` — computed from `workouts` table
- `/coach/dashboard` — live coach + client queue (except `hard_cap` fallback)
- `/dashboard` — profile name/email only (stats/activity are mock)

---

## 7. Highest Priority Tasks Before First Paying Customer

Ordered by business impact:

### P0 — Must have (blocking revenue / trust)

1. **Payment → account provisioning flow**  
   After Razorpay payment, create auth user + `profiles` row, set subscription status, and trigger WhatsApp/onboarding. Today payment and portal are disconnected.

2. **Verify Supabase schema + RLS in production**  
   Commit migrations; ensure `profiles`, `coaches`, `workouts` tables, columns, and policies match what the app queries. Without this, paying customers hit errors on signup/profile/workouts.

3. **Client check-in flow**  
   Landing page and FAQ promise 2× weekly check-ins through the portal. Build client check-in submission + coach review — this is the core product promise.

4. **Fix broken coach routes**  
   Build `/coach/client/[id]` (minimum viable client view) or remove dead links until ready. Fix `/coach/clients` 404.

5. **Replace dashboard mock data**  
   Wire stats and recent activity to real `workouts` / check-in data. Paying customers will immediately notice fake numbers.

### P1 — Should have (operational readiness)

6. **Coach–client assignment**  
   Mechanism to set `profiles.coach_id` when a customer pays or onboardboards (admin tool or automated).

7. **Plan delivery workflow**  
   Coach ability to mark `plan_delivered` and share diet/workout plans (even a simple PDF/link upload).

8. **Server-side auth protection**  
   Use `src/lib/supabase/server.ts` + middleware redirects so protected routes are not accessible before client hydration.

9. **Signup creates profile row**  
   Database trigger or post-signup handler so new users are not dropped into an empty state.

10. **Add missing landing page assets**  
    Upload `/before.jpg` and `/after.jpg` to `public/` or remove broken image references.

### P2 — Nice to have (polish / scale)

11. Consolidate Supabase client creation (use shared `lib/supabase` helpers).  
12. Add error handling UX on workout/profile save failures.  
13. Password reset and email verification flows.  
14. Wire up Resend for transactional emails (welcome, check-in reminders).  
15. Remove unused dependencies (`inngest`, `chart.js`, etc.) or implement them.  
16. Delete orphan file `src/app/coach/login/Untitled`.  
17. Add `.env.example` documenting required variables.

---

## Appendix: Route Map

| Route | Built | Auth | Data source |
|---|---|---|---|
| `/` | ✅ | Public | Static/marketing |
| `/login` | ✅ | Public | Supabase Auth |
| `/signup` | ✅ | Public | Supabase Auth |
| `/dashboard` | ✅ | Client-side gate | Profile (real) + stats (mock) |
| `/profile` | ✅ | Client-side gate | Supabase `profiles` |
| `/workouts` | ✅ | Client-side gate | Supabase `workouts` |
| `/progress` | ✅ | Client-side gate | Supabase `workouts` |
| `/coach/login` | ✅ | Public | Supabase Auth + `coaches` |
| `/coach/dashboard` | ✅ | Client-side gate | Supabase `coaches` + `profiles` |
| `/coach/clients` | ❌ | — | — |
| `/coach/client/[id]` | ❌ | — | — |
| `/test` | ✅ | Public | Dev only |

---

## Appendix: Environment Variables

| Variable | Required | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | All Supabase clients, middleware |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | All Supabase clients, middleware |

No other environment variables are referenced in application code today.
