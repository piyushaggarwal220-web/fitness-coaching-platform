# Jarvis Production Readiness

Final architecture milestone: Phases 1–22.

## Architecture

Jarvis is a layered operator on the LURVOX platform:

Observe → Detect → Understand → Remember → Identify opportunities → Plan → Prioritize → Propose → Approve (when required) → Execute via Phase 12 → Verify → Measure → Learn → Update strategy → Repeat

**Authoritative layers (do not bypass):**
- Phase 12 controlled execution
- Phase 13 events
- Phase 14 strategic memory
- Phase 3 learning
- Cost governor, approvals, risk, kill switch

## Capabilities

See [JARVIS-CAPABILITY-MATRIX.md](./JARVIS-CAPABILITY-MATRIX.md).

## Integrations

| System | Mode |
|--------|------|
| Meta | Reads/sync OK; live writes **OFF** |
| Instagram | Publishing **OFF**; intelligence best-effort |
| Shopify | Commerce reads separate from LURVOX `purchases` |
| Brave | Optional research |
| Shotstack | Optional render |
| OpenAI / Anthropic | Cost-governed |

## Security

- Admin APIs require platform admin
- New Jarvis tables use RLS (`is_platform_admin`)
- Forbidden tools cannot raise budgets / disable audit / enable live Meta
- Secrets must not appear in logs, SSE, UI, or tool outputs

## Permissions

Risk classes: READ / LOW_RISK / SIGNIFICANT / DANGEROUS (+ FORBIDDEN set)

Unknown tools cannot execute. Model text cannot invent tool names that bypass the registry.

## Costs

`assertAiBudgetAvailable` + `recordCostUsage`. Exhaustion → `PAUSED_BUDGET`. No automatic budget increase.

## Failure handling

- Malformed LLM / tool output: reject, do not execute
- Provider unavailable: structured failure / NOT_CONFIGURED / UNAVAILABLE
- Event storms: fingerprint, dedupe, coalesce, cooldowns, caps
- Retries: bounded with classification (Phase 12)
- Verification failure ≠ success

## Execution controls

Kill switch, dry-run, shadow, canary, reservations, locks, idempotency, approval TTL, receipts, rollback metadata, incidents.

## Memory & learning

Hierarchy FACT→…→STRATEGIC_INSIGHT with evidence gates. Research cannot mint operating rules. Taste ≠ strategy. Funnel isolation enforced.

## Plans & long-horizon

Phase 16 goals/plans + Phase 21 health/review/priority/attention. No silent replan. Resumable durable state.

## Experiments

`marketing_experiments` extended; insufficient data cannot declare winners; no Meta auto-writes from experiment tools.

## Financial integrity

LURVOX revenue from `purchases` (IST). Meta by funnel from `marketing_performance`. No double-count. No invented LTV/margin.

## Background

Reuse overnight / event workers / existing crons — no six new cron systems. Jobs must be idempotent and bounded.

## Known limitations

- Landing/checkout analytics unsupported
- Live Meta/IG intentionally off
- Goal progress not auto-invented from incomplete metrics
- Some providers NOT_CONFIGURED until keys exist

## Recommended rollout

1. Keep live Meta/IG **OFF**
2. Operate READ + LOW_RISK + approval-gated SIGNIFICANT prepare paths
3. Validate morning briefs, opportunities, plans, experiments metadata
4. Only then consider controlled enablement of a single write class with canary + kill switch drills

## Verification

```bash
npm run verify:jarvis-final-system
npx tsc --noEmit
```
