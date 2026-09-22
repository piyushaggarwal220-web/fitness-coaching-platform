/**
 * Phase 12 — Controlled Autonomous Execution
 */

export {
  evaluateExecutionPolicy,
  resolveAndEvaluatePolicy,
  classifyToolAction,
  systemForTool,
  getExecutionConfig,
  executionKillSwitchActive,
  dryRunEnabled,
  shadowModeEnabled,
  DEFAULT_EXECUTION_LIMITS,
  PROTECTED_EXECUTION_SETTING_KEYS,
} from '@/lib/jarvis/execution/policy/index'
export { runExecutionGate } from '@/lib/jarvis/execution/gate'
export {
  createExecutionReceipt,
  updateExecutionReceipt,
  listRecentReceipts,
  getExecutionReceipt,
  findReceiptByIdempotency,
} from '@/lib/jarvis/execution/receipts'
export { buildIdempotencyKey, fingerprintToolInput } from '@/lib/jarvis/execution/idempotency'
export { acquireExecutionLock, releaseExecutionLock } from '@/lib/jarvis/execution/locks'
export { reserveExecutionCapacity, reconcileReservation } from '@/lib/jarvis/execution/reservations'
export { classifyError, shouldRetry, backoffMs } from '@/lib/jarvis/execution/retry'
export { buildRollbackPlan } from '@/lib/jarvis/execution/rollback'
export { recordExecutionIncident, executionIncidentFingerprint } from '@/lib/jarvis/execution/incidents'
export { explainExecutionDecision } from '@/lib/jarvis/execution/explain'
export type {
  ExecutionDecision,
  ActionClass,
  PolicyResult,
  ExecutionReceipt,
  ExecutionLimits,
  ExecutionMode,
} from '@/lib/jarvis/execution/policy/types'
