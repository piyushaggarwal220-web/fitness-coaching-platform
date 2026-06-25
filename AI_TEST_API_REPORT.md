# AI Test API — Implementation Report

**Date:** June 19, 2026  
**Build status:** ✅ `npm run build` succeeded

---

## Goal

Internal API to verify the complete AI plan generation pipeline before coach workflow integration. No UI, no database writes.

---

## Files created

| File | Purpose |
|---|---|
| `src/app/api/ai/test-plan/route.ts` | POST endpoint for end-to-end AI plan testing |

---

## Endpoint

```
POST /api/ai/test-plan
```

### Request body

```json
{
  "clientId": "uuid-of-client-profile",
  "coachInstructions": "Optional coaching guidance for the AI"
}
```

| Field | Required | Description |
|---|---|---|
| `clientId` | Yes | `profiles.id` (auth user id) |
| `coachInstructions` | No | Passed through to `generatePlan()` |

### Success response (200)

```json
{
  "success": true,
  "generatedPlan": { ... },
  "complexityScore": { "score": 5, "tier": "MEDIUM", "recommendedModel": "...", "reasoning": [] },
  "selectedModel": "claude-sonnet-4-20250514",
  "estimatedTokens": 3200,
  "inputTokens": 4100,
  "outputTokens": 1800,
  "generationTimeMs": 12450
}
```

### Error responses

| Status | Condition |
|---|---|
| `400` | Invalid JSON or missing `clientId` |
| `401` | Not authenticated |
| `403` | `TEST_MODE` not enabled, or `DEV_ADMIN_EMAIL` mismatch |
| `404` | Client profile not found |
| `422` | Plan generation failed validation (after retry) |
| `500` | Missing env vars or unexpected server error |

Error body shape:

```json
{ "success": false, "error": "Human-readable message" }
```

---

## Workflow

1. **Access control** — `TEST_MODE=true`, authenticated session, optional `DEV_ADMIN_EMAIL`
2. **Env check** — `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. **Load profile** — `profiles` row by `clientId` (admin client, read-only)
4. **Load check-in** — latest `checkins` row for client (optional, may be null)
5. **Generate** — `generatePlan({ profile, latestCheckin, coachInstructions })`
6. **Return** — plan JSON + complexity + token usage + timing

No writes to `plans`, `profiles`, or `checkins`.

---

## Security

| Control | Implementation |
|---|---|
| Test-only | Gated by `TEST_MODE=true` (same as `/api/dev/seed`) |
| Auth required | Supabase session via `createClient()` |
| Admin email | Optional `DEV_ADMIN_EMAIL` restriction |
| Service role | Used for read-only profile/check-in load + knowledge in pipeline |
| API key | `ANTHROPIC_API_KEY` never exposed to client |

**Do not enable `TEST_MODE` on production.**

---

## Testing with curl

```bash
# Sign in via browser first, then use session cookie, or test from an authenticated client.

curl -X POST http://localhost:3000/api/ai/test-plan \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-supabase-session-cookies>" \
  -d '{
    "clientId": "YOUR_CLIENT_UUID",
    "coachInstructions": "4-day upper/lower split, moderate deficit"
  }'
```

Use dev tools (`/admin/dev-tools`) to create a test client and copy the `clientId` from the activity log.

### Required `.env.local`

```env
TEST_MODE=true
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_SERVICE_ROLE_KEY=...
# Optional:
DEV_ADMIN_EMAIL=you@example.com
```

---

## Build result

```
npm run build — SUCCESS (exit code 0)
New route: ƒ /api/ai/test-plan
23 routes generated
```
