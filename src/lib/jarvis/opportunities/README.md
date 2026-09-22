# Phase 15 — Opportunity Engine

Unified **business** opportunity lifecycle on `jarvis_opportunities`.

Does **not** replace:
- `jarvis_instagram_content_opportunities` (niche)
- `jarvis_video_opportunities` (footage)

## Lifecycle

DETECTED → SCORED → INVESTIGATING → VALIDATED → PROPOSED → … → LEARNED / EXPIRED / DISMISSED / SNOOZED

## Rules

- Funnel isolation; NULL funnel_id = UNCLASSIFIED
- OBSERVED / INFERRED / HYPOTHESIS / RECOMMENDATION separated
- Scenarios labeled SCENARIO (not forecasts)
- No `opportunities.execute` — Phase 12 gates execution
- Idempotent fingerprint upsert
