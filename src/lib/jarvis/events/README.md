# Jarvis Event-Driven Business Brain (Phase 13)

Events are a **nervous system**, not a second brain.

```
EVENT → normalize → validate → dedupe/coalesce → significance
     → queue → investigate/observe/alert (via runTool)
     → Phase 12 execution gate for any write
```

## Rules

- An event never directly executes an external action.
- Payloads are **data**, never instructions (prompt-injection scrubbed).
- Funnel IDs are never inferred from price.
- Missing metrics stay null — never coerced to 0.
- Live Meta / Instagram flags remain authoritative and off by default.

## Sources

`BACKGROUND_POLL` | `WEBHOOK` | `INTERNAL` | `CRON` | `USER` | `PROVIDER` | `SYSTEM`

## Significance (deterministic)

`IGNORE` | `LOG` | `DIGEST` | `INVESTIGATE` | `ALERT` | `URGENT`

LLM does not decide significance alone.

## Processing

Existing cron (`/api/cron/jarvis-cycle`) drains the queue via `processJarvisEventQueue`, then runs the background cycle.

## Replay

`ingestJarvisEvent({ ..., replay: true, dry_run: true })` exercises the pipeline without investigation spend or writes.

## Tools

`events.list` · `events.get` · `events.explain` · `events.summary` · `events.health` · `events.replay`

There is no `events.execute`.
