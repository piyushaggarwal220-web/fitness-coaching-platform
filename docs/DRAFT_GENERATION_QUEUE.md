# Draft generation queue — remaining work

## Current state (private beta)

Weekly AI draft generation runs **in-process** on check-in submit:

- `src/app/api/checkin/submit/route.ts` calls `generateWeeklyPlanDraft()` with `.catch(console.error)`
- Manual/retry generation uses `POST /api/coach/ai-draft/retry`
- Coach panel manual generation runs client-side AI calls, then upserts the draft row

This sprint improved reliability within that model:

- One draft per check-in (upsert instead of duplicate inserts)
- Sanitized failure reasons returned to coaches
- Client coach messages always generated before draft save
- Metadata stripped on publish and in all display/prompt paths

## Why Inngest was not wired in this sprint

`inngest` is listed in `package.json` but **no Inngest client, functions, or API route exist** in the repo. Wiring it would require:

1. `src/inngest/client.ts` — Inngest app definition
2. `src/inngest/functions/weekly-plan-draft.ts` — durable function wrapping `generateWeeklyPlanDraft`
3. `src/app/api/inngest/route.ts` — serve handler for Inngest Cloud / dev
4. Environment variables: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
5. Replacing fire-and-forget in check-in submit with `inngest.send({ name: 'checkin/weekly.submitted', data: { ... } })`
6. Deployment configuration (Vercel integration or self-hosted)

That is a **new infrastructure surface**, not a small reliability patch. Estimated effort: 0.5–1 day including dev/prod config and failure monitoring.

## Recommended next step

After private beta:

1. Add Inngest function `generate-weekly-plan-draft` with 3 retries and 5-minute timeout
2. Emit event from check-in submit instead of inline `generateWeeklyPlanDraft`
3. Store job status in `ai_generation_logs` (already used) or a `draft_jobs` table
4. Remove the 12-minute `isGenerating` heuristic in `ai-draft/status` once job status is authoritative

## Operational mitigations (active now)

| Risk | Mitigation |
|------|------------|
| Serverless timeout during auto-draft | Coach can retry from check-in panel; upsert prevents duplicate drafts |
| Silent failure | `failureError` returned from status API with sanitized message |
| Empty coach notes | `ensureClientCoachMessage` + publish validation |
| Meta leaked to client | Stripped on load, save, publish, prompts, and comparison |
