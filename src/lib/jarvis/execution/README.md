# Jarvis Controlled Execution (Phase 12)

Writes still flow through the existing path:

```
tool → risk engine → execution policy → cost → approval → action-runner → provider → verify → receipt → learn
```

The policy engine **tightens** decisions. It does not replace the risk engine.

## Modes

| Mode | Behavior |
|------|----------|
| `approval` (default) | Significant writes need approval |
| `guarded` | Level 3+ may auto-run allowlisted low-risk classes within caps |
| `dry_run` | Full pipeline, **no** external write |
| `shadow` | Record what would happen, **no** write |

## Kill switch

- Env `JARVIS_EXECUTION_ENABLED=false` **or** `JARVIS_EXECUTION_KILL_SWITCH=true` **or** settings `execution_kill_switch`
- Stops external writes; reads continue
- Jarvis **cannot** clear the kill switch via tools

## Live flags (unchanged)

- `LIVE_META_EXECUTION_ENABLED` — ACTIVE Meta spend/activation
- `LIVE_INSTAGRAM_PUBLISHING_ENABLED` — live IG publish

Env flags always win over DB settings.

## Idempotency & locks

Every write gets an idempotency key + short-lived lock so concurrent workers cannot double-apply the same change.

## Receipts

`jarvis_execution_receipts` stores safe before/after, policy decision, verification, cost. No secrets.

## Lifecycle

```
PROPOSED → POLICY → APPROVAL? → RESERVED → EXECUTING → PROVIDER → VERIFYING → VERIFIED → MEASURE → LEARN
```

Failure at any step stops dependents, records a receipt, and may open a deduped incident.

## Admin controls

Only platform admins (via Settings → Execution Controls or `POST /api/admin/jarvis/execution`) may change kill switch, dry-run, or shadow mode. Jarvis tools cannot raise limits or clear the kill switch.

## Tools (read/status only)

- `execution.policy_status`
- `execution.preview`
- `execution.receipt`
- `execution.limits`
- `execution.kill_switch_status`
- `execution.explain`

There is no unrestricted `execute_anything` tool.
