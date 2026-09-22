/**
 * Phase 15 — Opportunity Engine
 * Layer on events + strategic memory + funnel performance.
 * Does not execute significant actions. Phase 12 remains authoritative.
 */

export type * from '@/lib/jarvis/opportunities/types'
export {
  scoreOpportunity,
  derivePriority,
  freshnessFromAgeHours,
  uncertaintyFromEvidence,
  cpaSpendScenario,
} from '@/lib/jarvis/opportunities/scoring'
export {
  opportunityBusinessFingerprint,
  upsertOpportunity,
  getOpportunity,
  listOpportunities,
  transitionOpportunity,
  getOpportunityHealth,
} from '@/lib/jarvis/opportunities/store'
export {
  detectAndPersistOpportunities,
  opportunityFromEvent,
} from '@/lib/jarvis/opportunities/detect'
export {
  explainOpportunity,
  reviewOpportunities,
  runOpportunityScenario,
} from '@/lib/jarvis/opportunities/explain'
