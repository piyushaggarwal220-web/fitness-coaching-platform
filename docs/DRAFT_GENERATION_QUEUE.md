# Draft generation queue — remaining work

## Current state

Weekly AI draft generation still runs **in-process** (no Inngest functions wired yet), but reliability inside that model is improved:

- Check-in submit and coach Generate/Retry mark `weekly_draft_started` immediately, then run `generateWeeklyPlanDraft()` via Next.js `after()`
- Coach panel polls `/api/coach/ai-draft/status` instead of waiting on a long HTTP request (avoids proxy/browser timeouts looking like failures)
- Core diet + workout draft is saved **before** cardio/supplement calls, so a mid-pipeline kill still leaves a publishable draft
- Cardio/supplement failures soft-fail and keep the active plan values
- Publish goes through `/api/coach/ai-draft/publish` (service role) so deactivate/activate is not blocked by coach-scoped RLS
- Empty AI coach notes fall back to a default client message on publish; post-activate profile sync errors no longer fake a publish failure

## Why Inngest was not wired in this sprint

`inngest` is listed in `package.json` but **no Inngest client, functions, or API route exist** in the repo. Wiring it would require:

1. `src/inngest/client.ts` — Inngest app definition
2. `src/inngest/functions/weekly-plan-draft.ts` — durable function wrapping `generateWeeklyPlanDraft`
3. `src/app/api/inngest/route.ts` — serve handler for Inngest Cloud / dev
4. Environment variables: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
5. Replacing fire-and-forget in check-in submit with `inngest.send({ name: 'checkin/weekly.submitted', data: { ... } })`
6. Deployment configuration (Vercel integration or self-hosted)

That is a **new infrastructure surface**, not a small reliability patch.

## Recommended next step

1. Add Inngest function `generate-weekly-plan-draft` with 3 retries and 5-minute timeout
2. Emit event from check-in submit instead of inline `generateWeeklyPlanDraft`
3. Store job status in `ai_generation_logs` (already used) or a `draft_jobs` table
4. Prefer job status over the started-log / submit-time heuristics in `ai-draft/status`

## Operational mitigations (active now)

| Risk | Mitigation |
|------|------------|
| Serverless timeout during auto-draft | Core draft saved early; coach can retry; upsert prevents duplicate drafts |
| Browser/proxy timeout on Retry | Async 202 + status polling |
| Silent failure | `failureError` from status API with sanitized message; started logs for in-flight |
| Empty coach notes | `ensureClientCoachMessage` + publish fallback |
| Publish blocked by RLS / false errors | Admin publish route; soft profile sync after activate |
| Meta leaked to client | Stripped on load, save, publish, prompts, and comparison |
