/**
 * Phase 9 — Jarvis Content Operations Engine
 */

export * from '@/lib/jarvis/content-ops/types'
export {
  CONTENT_OPS_TRANSITIONS,
  canTransition,
  assertTransition,
  canSchedule,
  canPublish,
  pipelineColumnForState,
  statesForPipelineColumn,
  legacyStatusToOpsState,
  opsStateToLegacyStatus,
  isTerminalState,
  requiresApprovalForPublish,
} from '@/lib/jarvis/content-ops/state-machine'
export { computeNextAction, nextActionLabel } from '@/lib/jarvis/content-ops/next-action'
export { computeContentPriority } from '@/lib/jarvis/content-ops/priority'
export { detectCollisions } from '@/lib/jarvis/content-ops/collision'
export {
  DEFAULT_MIX,
  normalizeMix,
  mixCountsForBatch,
  observedMix,
  pickNextPillar,
} from '@/lib/jarvis/content-ops/mix'
export {
  createContentOpsItem,
  getContentOpsById,
  listContentOps,
  transitionContentOps,
  resolveOpsState,
  publishIdempotencyKey,
  savePublishPackage,
  linkContentArtifacts,
  refreshContentNextAction,
} from '@/lib/jarvis/content-ops/store'
export { getContentQueue, getContentOpsSummary } from '@/lib/jarvis/content-ops/queue'
export {
  listCalendarItems,
  scheduleContent,
  rescheduleContent,
  unscheduleContent,
  cancelScheduledContent,
  resolveRelativeSchedule,
  parseLocalDateTime,
} from '@/lib/jarvis/content-ops/calendar'
export {
  proposeContentSchedule,
  postsPerWeekFromCadence,
} from '@/lib/jarvis/content-ops/schedule-proposal'
export {
  buildPublishPackage,
  validatePublishPackage,
  preparePublishPackageForContent,
} from '@/lib/jarvis/content-ops/publish-package'
export {
  evaluatePublishGates,
  publishContentOps,
} from '@/lib/jarvis/content-ops/publish-ops'
export {
  proposeContentBatch,
  executeApprovedBatch,
  opportunityToQueueItem,
} from '@/lib/jarvis/content-ops/batch'
export {
  buildDailyContentBrief,
  formatDailyBriefText,
  buildWeeklyContentReport,
} from '@/lib/jarvis/content-ops/brief'
export {
  compareReachToBaseline,
  startMeasurement,
  completeMeasurement,
  getContentProvenance,
  recordAudienceSignalFromContent,
  MEASUREMENT_WINDOWS_HOURS,
} from '@/lib/jarvis/content-ops/measurement'
export {
  runContentOpsMaintenance,
  isRetryablePublishError,
  getBlockedContentSummary,
} from '@/lib/jarvis/content-ops/maintenance'
export { recordContentOpsTransition } from '@/lib/jarvis/content-ops/audit'
