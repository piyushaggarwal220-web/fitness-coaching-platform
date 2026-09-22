# Strategic Intelligence (Phase 14)

Layer **on top of** existing `jarvis_memory`, decisions, outcomes, and Taste Engine.

```
FACT → OBSERVATION → PATTERN → HYPOTHESIS → LESSON → OPERATING_RULE → STRATEGIC_INSIGHT
```

All writes go through `remember()` / `validateMemoryWrite()`.

## Principles

- Evidence-backed, time-aware, scoped, confidence-aware
- Funnel isolation (₹99 ≠ ₹1,699)
- Conflicts preserved (never silent overwrite)
- Stale ≠ deleted
- Taste ≠ strategy
- External research cannot mint operating rules
- Memory informs reasoning; **Phase 12 policy** decides permission

## Tools

`memory.strategic_review` · `memory.explain` · `memory.search_strategic` · `memory.list_conflicts` · `memory.business_snapshot` · `memory.confirm` · `memory.reject` · `memory.correct` · `memory.health`

## Causality

Always prefer `CAUSALITY_NOT_ESTABLISHED` / `TEMPORAL_ASSOCIATION` unless evidence explicitly supports a stronger (still hypothetical) stance.

## Bridges

- **Events** → `recordEventAsObservation` (single event = OBSERVATION only)
- **Outcomes** → `maybePromoteOutcomePattern` when sample ≥ 3
- **Research** → `findRecentStrategicAnswer` before Brave spend
- **Taste** → rejected on strategic write (`domain: TASTE`)

## Tables

- `jarvis_memory` (store of record — hierarchy via `memory_kind` / tags)
- `jarvis_memory_relationships`
- `jarvis_memory_conflicts`

## Cost

Strategic review / snapshot / search are READ tools with estimated costs; synthesis is not continuous.
