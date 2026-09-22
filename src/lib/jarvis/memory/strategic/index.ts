/**
 * Phase 14 strategic memory — layer on jarvis_memory / learning loop.
 * Not a second brain. Phase 12 policy remains authoritative for actions.
 */

export type * from '@/lib/jarvis/memory/strategic/types'
export {
  buildEvidenceItem,
  evidenceLines,
  canPromoteToPattern,
  canPromoteToOperatingRule,
} from '@/lib/jarvis/memory/strategic/evidence'
export { writeStrategicMemory } from '@/lib/jarvis/memory/strategic/write'
export {
  detectStatementConflict,
  persistConflict,
  listOpenConflicts,
  scanConflictsAmong,
  explainConflict,
} from '@/lib/jarvis/memory/strategic/conflicts'
export {
  searchStrategicMemory,
  buildBusinessKnowledgeSnapshot,
  runStrategicReview,
  explainMemory,
  STRATEGIC_RETRIEVAL_LIMITS,
} from '@/lib/jarvis/memory/strategic/retrieval'
export { applyMemoryAdminAction } from '@/lib/jarvis/memory/strategic/admin'
export {
  runStrategicMemoryMaintenance,
  getStrategicMemoryHealth,
} from '@/lib/jarvis/memory/strategic/maintenance'
export {
  recordEventAsObservation,
  maybePromoteOutcomePattern,
  findRecentStrategicAnswer,
} from '@/lib/jarvis/memory/strategic/synthesis'
