# Production Route Manifest

**Platform:** Fitness Coaching Platform (Next.js App Router)  
**Generated:** 2026-07-09  
**Source of truth:** `src/app/**` pages + `.next/routes-manifest.json` (production build)  
**Auth model:** Supabase email/password; role checks are **client-side per page** (no middleware route guards)

---

## Production base URL

URLs below use the value resolved by `resolveAppBaseUrl()` in `src/lib/admin/portal-urls.ts`:

| Priority | Environment variable | Example |
|----------|---------------------|---------|
| 1 | `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` |
| 2 | `VERCEL_URL` (auto on Vercel) | `https://fitness-coaching-platform.vercel.app` |
| 3 | Fallback | `http://localhost:3000` |

> **Current status:** `NEXT_PUBLIC_APP_URL` is **not set** in local `.env.local`. Set it in production before QA on external devices.

**Production base URL placeholder used below:** `https://YOUR_PRODUCTION_DOMAIN`

---

## Legend

| Column | Meaning |
|--------|---------|
| **Auth** | Must be signed in via Supabase |
| **Payment** | Requires paid/trial entitlement (`payment_confirmed` or `access_source`) |
| **Onboarding** | Requires `onboarding_complete` (or `onboarding_completed_at`) |
| **Role** | `profiles.role` or portal-specific check |

**Role values:** `public` · `client` · `coach` (must have `coaches` row) · `admin` · `super_admin`

---

## 1. Landing

| Path | Production URL | Purpose | Required role | Auth |
|------|----------------|---------|---------------|------|
| `/` | https://YOUR_PRODUCTION_DOMAIN/ | Marketing landing page — hero, pricing, testimonials, FAQ, WhatsApp CTA | Public | No |

**Inbound links:** Pricing cards → `/checkout?plan={slug}`  
**Outbound:** No links to `/login`, `/signup`, `/coach/login`, or `/admin/login` from landing (users must know portal URLs).

---

## 2. Authentication

| Path | Production URL | Purpose | Required role | Auth |
|------|----------------|---------|---------------|------|
| `/login` | https://YOUR_PRODUCTION_DOMAIN/login | Client portal sign-in; routes to dashboard, onboarding, or checkout post-auth | Public (form) | No |
| `/signup` | https://YOUR_PRODUCTION_DOMAIN/signup | **Redirects to** `/checkout?plan=6_months` (legacy URL) | Public | No |
| `/checkout` | https://YOUR_PRODUCTION_DOMAIN/checkout | Razorpay purchase + account creation (`?plan=6_months` etc.) | Public (form) | No |
| `/coach/login` | https://YOUR_PRODUCTION_DOMAIN/coach/login | Coach portal sign-in; verifies `coaches` row | Public (form) | No |
| `/admin/login` | https://YOUR_PRODUCTION_DOMAIN/admin/login | Admin console sign-in; verifies `admin` or `super_admin` role | Public (form) | No |

### Post-login routing (client)

| Condition | Redirect target |
|-----------|-----------------|
| Not paid (production) | `/checkout?plan=6_months` |
| Paid, onboarding incomplete | `/onboarding` |
| Paid, onboarding complete | `/dashboard` |
| Profile load failed | `/dashboard` (safe fallback) |

---

## 3. Client

All client app routes use `authenticateClient()` unless noted. Coaches/admins can authenticate here but are intended for **client** users.

| Path | Production URL | Purpose | Required role | Auth | Payment | Onboarding |
|------|----------------|---------|---------------|------|---------|------------|
| `/dashboard` | https://YOUR_PRODUCTION_DOMAIN/dashboard | Client home — plan status, check-in CTA, activity | Client | Yes | Yes | Redirects if incomplete |
| `/onboarding` | https://YOUR_PRODUCTION_DOMAIN/onboarding | Multi-step intake questionnaire + photos | Client | Yes | Yes | N/A (this page) |
| `/profile` | https://YOUR_PRODUCTION_DOMAIN/profile | View/edit client profile | Client | Yes | Yes | Yes |
| `/plan` | https://YOUR_PRODUCTION_DOMAIN/plan | View active coaching plan | Client | Yes | Yes | Yes |
| `/checkin` | https://YOUR_PRODUCTION_DOMAIN/checkin | Submit weekly check-in | Client | Yes | Yes | Yes |
| `/workouts` | https://YOUR_PRODUCTION_DOMAIN/workouts | Workout log CRUD | Client | Yes | Yes | Yes |
| `/progress` | https://YOUR_PRODUCTION_DOMAIN/progress | Progress stats from workouts | Client | Yes | Yes | Yes |
| `/client/support` | https://YOUR_PRODUCTION_DOMAIN/client/support | List support requests | Client | Yes | Yes | Yes |
| `/client/support/new` | https://YOUR_PRODUCTION_DOMAIN/client/support/new | Create support request | Client | Yes | Yes | Yes |
| `/client/support/[id]` | https://YOUR_PRODUCTION_DOMAIN/client/support/{id} | Support thread detail | Client | Yes | Yes | Yes |

---

## 4. Coach

All coach routes use `requireCoach()` — authenticated user **must have a row in `coaches`** linked by `user_id`.

| Path | Production URL | Purpose | Required role | Auth |
|------|----------------|---------|---------------|------|
| `/coach/dashboard` | https://YOUR_PRODUCTION_DOMAIN/coach/dashboard | Coach home — client queue, complexity summary, quick actions | Coach | Yes |
| `/coach/clients` | https://YOUR_PRODUCTION_DOMAIN/coach/clients | Client roster (supports `?tier=low\|medium\|high`) | Coach | Yes |
| `/coach/client/[id]` | https://YOUR_PRODUCTION_DOMAIN/coach/client/{id} | Single client profile + actions | Coach | Yes |
| `/coach/client/[id]/generate-plan` | https://YOUR_PRODUCTION_DOMAIN/coach/client/{id}/generate-plan | AI plan generation wizard | Coach | Yes |
| `/coach/plans` | https://YOUR_PRODUCTION_DOMAIN/coach/plans | All plans for coach's clients | Coach | Yes |
| `/coach/plan/new` | https://YOUR_PRODUCTION_DOMAIN/coach/plan/new | Create plan (optional `?clientId=` `?fromAi=1`) | Coach | Yes |
| `/coach/plan/[id]` | https://YOUR_PRODUCTION_DOMAIN/coach/plan/{id} | Edit / activate / duplicate plan | Coach | Yes |
| `/coach/checkins` | https://YOUR_PRODUCTION_DOMAIN/coach/checkins | Check-in inbox | Coach | Yes |
| `/coach/checkin/[id]` | https://YOUR_PRODUCTION_DOMAIN/coach/checkin/{id} | Review single check-in | Coach | Yes |
| `/coach/support` | https://YOUR_PRODUCTION_DOMAIN/coach/support | Support queue (unclaimed) | Coach | Yes |
| `/coach/support/[id]` | https://YOUR_PRODUCTION_DOMAIN/coach/support/{id} | Claimed support thread | Coach | Yes |

---

## 5. Admin

Protected by `useAdminGuard()` in `src/app/admin/layout.tsx` (except `/admin/login`). Requires `profiles.role` ∈ `{ admin, super_admin }`.

| Path | Production URL | Purpose | Required role | Auth | Notes |
|------|----------------|---------|---------------|------|-------|
| `/admin` | https://YOUR_PRODUCTION_DOMAIN/admin | Index redirect → `/admin/dashboard` | Admin | Yes | Server redirect |
| `/admin/login` | https://YOUR_PRODUCTION_DOMAIN/admin/login | Admin sign-in | Public (form) | No | |
| `/admin/dashboard` | https://YOUR_PRODUCTION_DOMAIN/admin/dashboard | Founder dashboard — stats, analytics, health | Admin | Yes | |
| `/admin/clients` | https://YOUR_PRODUCTION_DOMAIN/admin/clients | Client roster + search | Admin | Yes | |
| `/admin/clients/[id]` | https://YOUR_PRODUCTION_DOMAIN/admin/clients/{id} | Client detail + coach assign | Admin | Yes | Delete: **super_admin** only |
| `/admin/coaches` | https://YOUR_PRODUCTION_DOMAIN/admin/coaches | Coach roster | Admin | Yes | |
| `/admin/coaches/[id]` | https://YOUR_PRODUCTION_DOMAIN/admin/coaches/{id} | Coach detail + clients | Admin | Yes | Delete: **super_admin** only |
| `/admin/plans` | https://YOUR_PRODUCTION_DOMAIN/admin/plans | Read-only active plans | Admin | Yes | |
| `/admin/support` | https://YOUR_PRODUCTION_DOMAIN/admin/support | Support queue oversight | Admin | Yes | |
| `/admin/support/[id]` | https://YOUR_PRODUCTION_DOMAIN/admin/support/{id} | Support thread (admin view) | Admin | Yes | |
| `/admin/onboarding` | https://YOUR_PRODUCTION_DOMAIN/admin/onboarding | Clients pending onboarding | Admin | Yes | |
| `/admin/ai-logs` | https://YOUR_PRODUCTION_DOMAIN/admin/ai-logs | AI generation trace list | Admin | Yes | |
| `/admin/ai-logs/[id]` | https://YOUR_PRODUCTION_DOMAIN/admin/ai-logs/{id} | AI log detail | Admin | Yes | |
| `/admin/prompts` | https://YOUR_PRODUCTION_DOMAIN/admin/prompts | Prompt library list + import | Admin | Yes | |
| `/admin/prompts/new` | https://YOUR_PRODUCTION_DOMAIN/admin/prompts/new | Create prompt draft | Admin | Yes | |
| `/admin/prompts/[id]` | https://YOUR_PRODUCTION_DOMAIN/admin/prompts/{id} | Edit / publish prompt | Admin | Yes | |
| `/admin/notifications` | https://YOUR_PRODUCTION_DOMAIN/admin/notifications | Notifications module | Admin | Yes | **Placeholder UI only** |
| `/admin/purchases` | https://YOUR_PRODUCTION_DOMAIN/admin/purchases | Purchase history | Admin | Yes | |
| `/admin/purchases/[id]` | https://YOUR_PRODUCTION_DOMAIN/admin/purchases/{id} | Purchase detail | Admin | Yes | |
| `/admin/settings` | https://YOUR_PRODUCTION_DOMAIN/admin/settings | System settings / feature flags | Admin | Yes | |
| `/admin/testing-tools` | https://YOUR_PRODUCTION_DOMAIN/admin/testing-tools | QA account creation (trial clients/coaches) | Admin | Yes | Internal QA |
| `/admin/dev-tools` | https://YOUR_PRODUCTION_DOMAIN/admin/dev-tools | Dev seed panel (full toolkit) | Admin | Yes | **404 in production** |

---

## 6. API

### Payment (public — no session required)

| Method | Path | Production URL | Purpose | Auth |
|--------|------|----------------|---------|------|
| POST | `/api/payment/create-order` | https://YOUR_PRODUCTION_DOMAIN/api/payment/create-order | Create Razorpay order | No |
| POST | `/api/payment/verify` | https://YOUR_PRODUCTION_DOMAIN/api/payment/verify | Verify payment + provision account + session | No |

### Coach (session + coach row)

| Method | Path | Production URL | Purpose | Auth |
|--------|------|----------------|---------|------|
| POST | `/api/coach/generate-plan` | https://YOUR_PRODUCTION_DOMAIN/api/coach/generate-plan | AI plan generation | Coach |
| GET | `/api/coach/complexity-analytics` | https://YOUR_PRODUCTION_DOMAIN/api/coach/complexity-analytics | Coach complexity dashboard data | Coach |

### Complexity (multi-role)

| Method | Path | Production URL | Purpose | Auth |
|--------|------|----------------|---------|------|
| POST | `/api/complexity/recalculate` | https://YOUR_PRODUCTION_DOMAIN/api/complexity/recalculate | Recalculate client complexity score | Client (own) · Coach (assigned) · Admin |
| GET | `/api/complexity/history` | https://YOUR_PRODUCTION_DOMAIN/api/complexity/history | Complexity history (`?clientId=`) | Client (own) · Coach (assigned) · Admin |

### Admin (session + admin role)

| Method | Path | Production URL | Purpose | Auth |
|--------|------|----------------|---------|------|
| GET | `/api/admin/settings` | https://YOUR_PRODUCTION_DOMAIN/api/admin/settings | System settings | Admin |
| GET | `/api/admin/platform-health` | https://YOUR_PRODUCTION_DOMAIN/api/admin/platform-health | Platform health metrics | Admin |
| GET | `/api/admin/business-analytics` | https://YOUR_PRODUCTION_DOMAIN/api/admin/business-analytics | Revenue / business analytics | Admin |
| GET | `/api/admin/complexity-analytics` | https://YOUR_PRODUCTION_DOMAIN/api/admin/complexity-analytics | Platform complexity analytics | Admin |
| GET | `/api/admin/exports` | https://YOUR_PRODUCTION_DOMAIN/api/admin/exports | CSV/XLSX exports (`?type=` `?format=`) | Admin |
| GET | `/api/admin/purchases` | https://YOUR_PRODUCTION_DOMAIN/api/admin/purchases | List purchases | Admin |
| GET | `/api/admin/purchases/[id]` | https://YOUR_PRODUCTION_DOMAIN/api/admin/purchases/{id} | Purchase detail | Admin |
| GET | `/api/admin/ai-logs/[id]` | https://YOUR_PRODUCTION_DOMAIN/api/admin/ai-logs/{id} | AI log detail | Admin |
| GET | `/api/admin/prompts/stats` | https://YOUR_PRODUCTION_DOMAIN/api/admin/prompts/stats | Prompt library stats | Admin |
| POST | `/api/admin/prompts` | https://YOUR_PRODUCTION_DOMAIN/api/admin/prompts | Create prompt draft | Admin |
| PATCH | `/api/admin/prompts/[id]` | https://YOUR_PRODUCTION_DOMAIN/api/admin/prompts/{id} | Update prompt draft | Admin |
| POST | `/api/admin/prompts/[id]` | https://YOUR_PRODUCTION_DOMAIN/api/admin/prompts/{id} | Publish / archive / restore version | Admin |
| POST | `/api/admin/prompts/[id]/preview` | https://YOUR_PRODUCTION_DOMAIN/api/admin/prompts/{id}/preview | Preview prompt render | Admin |
| POST | `/api/admin/prompts/import` | https://YOUR_PRODUCTION_DOMAIN/api/admin/prompts/import | Import production prompts | Admin |
| GET | `/api/admin/prompts/import` | https://YOUR_PRODUCTION_DOMAIN/api/admin/prompts/import | Verify imported prompts | Admin |
| GET | `/api/admin/testing-tools/coaches` | https://YOUR_PRODUCTION_DOMAIN/api/admin/testing-tools/coaches | List coaches for assignment | Admin |
| GET | `/api/admin/testing-tools/trial-clients` | https://YOUR_PRODUCTION_DOMAIN/api/admin/testing-tools/trial-clients | List trial clients | Admin |
| POST | `/api/admin/testing-tools/trial-client` | https://YOUR_PRODUCTION_DOMAIN/api/admin/testing-tools/trial-client | Create trial client | Admin |
| POST | `/api/admin/testing-tools/trial-coach` | https://YOUR_PRODUCTION_DOMAIN/api/admin/testing-tools/trial-coach | Create trial coach | Admin |
| POST | `/api/admin/testing-tools/fake-client` | https://YOUR_PRODUCTION_DOMAIN/api/admin/testing-tools/fake-client | Generate fake onboarding client | Admin |
| POST | `/api/admin/testing-tools/reset-client` | https://YOUR_PRODUCTION_DOMAIN/api/admin/testing-tools/reset-client | Reset trial client | Admin |
| POST | `/api/admin/testing-tools/reset-password` | https://YOUR_PRODUCTION_DOMAIN/api/admin/testing-tools/reset-password | Reset trial account password | Admin |
| POST | `/api/admin/clients/[id]/delete` | https://YOUR_PRODUCTION_DOMAIN/api/admin/clients/{id}/delete | Delete client account | **Super admin** |
| POST | `/api/admin/coaches/[id]/delete` | https://YOUR_PRODUCTION_DOMAIN/api/admin/coaches/{id}/delete | Delete coach account | **Super admin** |

### Dev-only (disabled in production)

| Method | Path | Production URL | Purpose | Production behavior |
|--------|------|----------------|---------|-------------------|
| GET/POST | `/api/dev/seed` | https://YOUR_PRODUCTION_DOMAIN/api/dev/seed | Dev data seeding | **403** |
| GET/POST | `/api/dev/prompt-import` | https://YOUR_PRODUCTION_DOMAIN/api/dev/prompt-import | Dev prompt import | **403** |
| POST | `/api/ai/test-plan` | https://YOUR_PRODUCTION_DOMAIN/api/ai/test-plan | AI test harness | **403** (unless `TEST_MODE`) |

---

## 7. Route audit — duplicates, unused, unreachable

### Redirect aliases (not duplicates — intentional)

| Route | Behavior |
|-------|----------|
| `/admin` | Server redirect → `/admin/dashboard` |

### Orphan / unreachable from UI (still publicly accessible if URL typed)

| Route | Issue | Recommendation |
|-------|-------|----------------|
| `/signup` | **No in-app links** — landing uses `/checkout` directly; login page has no signup link | Link from landing/login or remove route |
| `/test` | **Dev scratch page** — button alert only; no navigation links | Remove before production or gate behind dev mode |
| `/login` | Not linked from landing page | Add "Client login" to landing footer/nav |
| `/coach/login` | Not linked from landing | Add to internal docs / coach onboarding email |
| `/admin/login` | Not linked from landing | Internal ops URL only (expected) |

### Production-blocked routes (exist in build, return 404 or 403)

| Route | Production behavior |
|-------|---------------------|
| `/admin/dev-tools` | **404** (`isDevToolkitEnabledClient()` → `notFound()`) |
| `/api/dev/*` | **403** |
| `/api/ai/test-plan` | **403** (unless `TEST_MODE=true`, which is disabled in production) |

### Placeholder / incomplete routes

| Route | Status |
|-------|--------|
| `/admin/notifications` | Placeholder — `AdminModulePlaceholder` only; no backend wired |

### Overlapping portal entry points (intentional, not bugs)

| Routes | Note |
|--------|------|
| `/login` vs `/coach/login` vs `/admin/login` | Three separate portals; same Supabase auth, different post-login validation |
| `/checkout` vs `/signup` | Both create accounts; checkout is the primary funnel |

### Framework-internal routes (skip in QA)

| Route | Note |
|-------|------|
| `/_not-found` | Next.js 404 page |
| `/_global-error` | Next.js error boundary |
| `/favicon.ico` | Static asset |

---

## 8. QA test matrix (quick reference)

### Smoke — public (no auth)

- [ ] `https://YOUR_PRODUCTION_DOMAIN/` — landing loads, pricing links work
- [ ] `https://YOUR_PRODUCTION_DOMAIN/checkout?plan=6_months` — checkout form loads

### Smoke — client journey

- [ ] `/login` → paid client → `/dashboard`
- [ ] `/onboarding` — save progress + complete
- [ ] `/plan`, `/checkin`, `/workouts`, `/progress`, `/profile`
- [ ] `/client/support` → `/client/support/new` → thread detail

### Smoke — coach journey

- [ ] `/coach/login` → `/coach/dashboard`
- [ ] `/coach/clients` → `/coach/client/{id}` → generate plan
- [ ] `/coach/plans`, `/coach/checkins`, `/coach/support`

### Smoke — admin journey

- [ ] `/admin/login` → `/admin/dashboard`
- [ ] `/admin/clients`, `/admin/coaches`, `/admin/purchases`, `/admin/prompts`
- [ ] Non-admin account rejected at `/admin/login`

### Security checks

- [ ] Client account cannot access `/admin/*` (guard redirects)
- [ ] Client account cannot access `/coach/*` (redirects to `/coach/login`)
- [ ] `/api/admin/*` returns 401/403 without admin session
- [ ] `/api/dev/*` returns 403 in production
- [ ] `/admin/dev-tools` returns 404 in production

### Device coverage

| Device type | Portals to test |
|-------------|-----------------|
| Desktop | All — especially admin console + coach plan editor |
| Mobile | `/`, `/checkout`, `/onboarding`, `/dashboard`, `/checkin` |
| External (4G) | Payment flow (`/checkout` → Razorpay → `/onboarding`) |

---

## 9. Regenerating production URLs

Set the production domain in your deployment environment:

```bash
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

Then replace `YOUR_PRODUCTION_DOMAIN` in this document, or run:

```bash
# PowerShell example
$base = $env:NEXT_PUBLIC_APP_URL
if (-not $base) { $base = "https://YOUR_PRODUCTION_DOMAIN" }
# Search docs/ROUTE_MANIFEST.md and substitute manually
```

Programmatic resolution (matches app behavior):

```ts
import { resolveAppBaseUrl, getPortalLoginUrls } from '@/lib/admin/portal-urls'

const base = resolveAppBaseUrl()
// base + '/dashboard', etc.
```

---

## 10. Route count summary

| Group | Page routes | API routes |
|-------|-------------|------------|
| Landing | 1 | — |
| Authentication | 5 | 2 (payment) |
| Client | 10 | 2 (complexity, shared) |
| Coach | 11 | 2 |
| Admin | 22 | 22 |
| Dev-only | 1 page + APIs | 3 |
| **Total** | **50** | **31** |

*Dynamic segments shown as `[id]`; substitute real UUIDs in QA.*
