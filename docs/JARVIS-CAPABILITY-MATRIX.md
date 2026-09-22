# Jarvis Capability Matrix (Phase 22)

Status meanings:
- **REAL** — Verified path exists and behaves as documented in safe mode
- **PARTIAL** — Exists with honest gaps / delegated to adjacent systems
- **NOT_CONFIGURED** — Requires external credentials or flags not set
- **BLOCKED** — Intentionally disabled or policy-blocked

| Capability | Status | Notes |
|------------|--------|-------|
| Meta reads / sync | REAL | Bounded sync + diagnostics |
| Meta writes (live spend/activation) | BLOCKED | LIVE_META_EXECUTION_ENABLED must stay false |
| Instagram organic reads | PARTIAL / NOT_CONFIGURED | Graph may be UNSUPPORTED; niche engine offline-capable |
| Instagram publishing | BLOCKED | LIVE_INSTAGRAM_PUBLISHING_ENABLED false |
| Shopify reads | PARTIAL | Store commerce separate from LURVOX revenue |
| Shopify writes / payment | BLOCKED | Forbidden tools |
| Brave / web research | NOT_CONFIGURED | Until BRAVE_SEARCH_API_KEY set; memory reuse works |
| Video analysis | PARTIAL | Provider honesty; live CV often unsupported |
| Video rendering (Shotstack) | NOT_CONFIGURED / PARTIAL | Requires webhook + keys |
| Content planning | REAL | Creative Director + content-ops |
| Content publishing | BLOCKED | Approval + live flag |
| Financial intelligence | REAL | purchases + funnel performance; no invented LTV |
| Experiments | REAL | marketing_experiments + Jarvis lifecycle; no Meta auto-write |
| Strategic planning (P16) | REAL | goals + plans |
| Long-horizon (P21) | REAL | health/review/priority/attention on same plans |
| Opportunities (P15) | REAL | durable jarvis_opportunities |
| Growth operator (P17) | REAL | reuses funnel/revenue SOTs |
| Content intelligence (P18) | PARTIAL | Thin layer over creative/content-ops/taste |
| Strategic memory (P14) | REAL | evidence gates, conflicts, funnel isolation |
| Learning (P3) | REAL | decisions + outcomes |
| Event brain (P13) | REAL | fingerprint/dedupe/storm |
| Controlled execution (P12) | REAL | kill switch, locks, receipts |
| Autonomous operator (P10) | REAL | observe/brief; no fake autonomy |
| Realtime voice (P11) | NOT_CONFIGURED / PARTIAL | Requires realtime keys |
| Cost governor | REAL | budgets + PAUSED_BUDGET |
| Approvals | REAL | SIGNIFICANT gated |
| Taste Engine | REAL | separate from strategy |
| Landing/checkout analytics | NOT_CONFIGURED | Growth stages labeled UNSUPPORTED |

Machine-readable JSON: `src/lib/jarvis/hardening/capability-matrix.json`
