/**
 * Phase 10 — Jarvis Autonomous Business Operator
 * Proactive operating loop over existing systems. No permission bypass.
 */

export * from '@/lib/jarvis/autonomous/types'
export { attentionFingerprint, opportunityFingerprint } from '@/lib/jarvis/autonomous/fingerprint'
export {
  emptyDiagnosis,
  buildDiagnosis,
  formatDiagnosisExplanation,
  containsCausalClaim,
  assertNoUnsupportedRootCause,
} from '@/lib/jarvis/autonomous/diagnosis'
export {
  computeBusinessHealth,
  severityToHealth,
  mapIntegrationStatus,
} from '@/lib/jarvis/autonomous/health'
export {
  detectBusinessAnomalies,
  findingToAttention,
  isSignificantForInvestigation,
} from '@/lib/jarvis/autonomous/anomalies'
export { buildUnifiedObservation } from '@/lib/jarvis/autonomous/observation'
export { detectOpportunities } from '@/lib/jarvis/autonomous/opportunities'
export {
  persistObservationSnapshot,
  upsertAttentionItems,
  listOpenAttention,
  persistMorningBrief,
  getLatestMorningBrief,
  notifyIfMeaningful,
} from '@/lib/jarvis/autonomous/store'
export { buildMorningBrief } from '@/lib/jarvis/autonomous/morning-brief'
export {
  planCrossSystemInvestigation,
  runBoundedInvestigation,
} from '@/lib/jarvis/autonomous/investigation'
export { ensureProactiveTask, buildTakeCarePlan } from '@/lib/jarvis/autonomous/tasks'
export { runAutonomousOperatorCycle } from '@/lib/jarvis/autonomous/overnight'
export { buildAwaySummary } from '@/lib/jarvis/autonomous/away-summary'
export { explainAttentionItem, explainWhyTelling } from '@/lib/jarvis/autonomous/explanations'
