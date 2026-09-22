# Phase 21 — Long-horizon Autonomous Business Manager

Extends Phase 16 `jarvis_strategic_plans` (no second plan system).

- Plan health: ON_TRACK / WATCH / AT_RISK / BLOCKED / REPLAN_REQUIRED / UNKNOWN
- Explained priority bands (not opaque scores)
- Attention budget caps
- Dependency graph exposes Meta/IG live-off as blockers
- Review does not silent-rewrite; replan still versioned

Tools: `strategy.long_horizon_review`, `plan_health`, `next_actions`, `dependencies`, `priorities`, `resume`, `replan_proposal`, `attention`
