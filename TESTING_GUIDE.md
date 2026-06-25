# Development Testing Guide

End-to-end testing without real Razorpay payments. Use the **Development Testing Toolkit** at `/admin/dev-tools` when test mode is enabled.

---

## Environment setup

Add to `.env.local` (local) and Vercel **Preview** only — **never enable in production**:

```env
TEST_MODE=true
NEXT_PUBLIC_TEST_MODE=true
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: restrict dev tools to one email
DEV_ADMIN_EMAIL=you@example.com
```

| Variable | Scope | Purpose |
|---|---|---|
| `TEST_MODE` | Server | Enables `/api/dev/seed` routes |
| `NEXT_PUBLIC_TEST_MODE` | Client | Shows `/admin/dev-tools` page and nav link |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Creates auth users and bypasses RLS for seeding |
| `DEV_ADMIN_EMAIL` | Server | Optional; only this user can call seed APIs |

When `TEST_MODE=false` or unset:

- `/admin/dev-tools` returns **404**
- Seed API returns **403**
- Dev Tools nav link is hidden

---

## Access dev tools

1. Set env vars above and restart `npm run dev`
2. Sign in with any account (or create one via signup)
3. If `DEV_ADMIN_EMAIL` is set, sign in with that email
4. Open **http://localhost:3000/admin/dev-tools**
   - Or use **Dev Tools** in the coach navbar (test mode only)

---

## How to create test accounts

### Test client

1. Click **Create Test Client**
2. Copy credentials from the activity log:
   - Email: `test-client-xxxxx@dev.local`
   - Password: `TestPass123!`
3. Sign out and sign in at `/login` as the test client

### Test coach

1. Click **Create Test Coach**
2. Copy credentials from the log
3. Sign in at `/coach/login` as the test coach

---

## How to simulate onboarding

**Option A — Dev tools (fast)**

1. Select the test **client** in the dropdown
2. Click **Mark Onboarding Complete**
3. Client can access `/dashboard`, `/profile`, `/workouts`, `/progress`, `/checkin`, `/plan`

**Option B — Manual UI**

1. Sign in as test client
2. Complete `/onboarding` wizard (7 steps)

---

## How to simulate check-ins

1. **Assign Client To Coach** — select client + coach, click button
2. **Create Sample Check-In** — creates a pending check-in with sample metrics and placeholder photos
3. Sign in as **coach** → `/coach/checkins` → review check-in
4. Sign in as **client** → `/dashboard` shows check-in status

---

## How to simulate plans

1. Ensure client is assigned to coach
2. Click **Create Sample Plan** (creates inactive plan v1)
3. Copy `planId` from the activity log into the Plan ID field
4. Click **Activate Sample Plan**
5. Sign in as **client** → `/plan` to view the active plan
6. Coach can edit at `/coach/plans` → open plan

---

## Full end-to-end testing workflow

```
1. Create Test Coach          → coach credentials
2. Create Test Client         → client credentials
3. Assign Client To Coach     → links profiles.coach_id
4. Mark Onboarding Complete   → unlocks client portal
5. Create Sample Plan         → note planId from log
6. Activate Sample Plan       → client sees plan at /plan
7. Create Sample Check-In     → coach reviews at /coach/checkins
```

### Verify client journey

| Step | URL | Expected |
|---|---|---|
| Login | `/login` | Redirect to dashboard or onboarding |
| Dashboard | `/dashboard` | Plan card + check-in status |
| My Plan | `/plan` | Active sample plan sections |
| Check-in | `/checkin` | Submit form (or use seeded check-in) |
| Profile | `/profile` | Edit profile |

### Verify coach journey

| Step | URL | Expected |
|---|---|---|
| Login | `/coach/login` | Coach dashboard |
| Clients | `/coach/clients` | Assigned test client |
| Plans | `/coach/plans` | Sample plan listed |
| Check-ins | `/coach/checkins` | Pending sample check-in |
| Review | `/coach/checkin/[id]` | Mark reviewed |

---

## Payment bypass

With `TEST_MODE=true`, no Razorpay integration is required. The landing page payment links are bypassed for testing — use dev tools to provision accounts directly.

---

## Security notes

- Never set `TEST_MODE=true` on production Vercel **Production** environment
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client (`NEXT_PUBLIC_` prefix)
- Use `DEV_ADMIN_EMAIL` in shared staging environments
- Test accounts use `@dev.local` emails — delete periodically in Supabase Auth dashboard

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Dev tools 404 | Set `NEXT_PUBLIC_TEST_MODE=true` and restart dev server |
| API 403 | Set `TEST_MODE=true` on server |
| API 500 missing key | Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` |
| Create user fails | Run Supabase migrations; check Auth settings |
| Assign fails | Ensure `coaches` and `profiles` tables exist |
| Plan/check-in fails | Run `checkins` and `plans` migrations |

---

## Related docs

- `ONBOARDING_REPORT.md` — onboarding flow
- `CHECKIN_REPORT.md` — check-in system
- `PLAN_SYSTEM_REPORT.md` — plan delivery
- `MVP_AUDIT.md` — overall platform status
