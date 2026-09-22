/**
 * Phase 7 — Jarvis Taste Engine public API.
 */

export * from '@/lib/jarvis/taste/types'
export {
  weightForEvidenceType,
  applyEvidenceWeight,
  resolveStatus,
  clampConfidence,
  oppositePolarity,
  decayConfidence,
  STALE_DAYS,
  CANDIDATE_THRESHOLD,
  ACTIVE_AUTO_THRESHOLD,
  ACTIVE_MIN_EVIDENCE,
} from '@/lib/jarvis/taste/confidence'
export {
  parseTasteFeedback,
  isRevisionOnlyInstruction,
  isSensitiveInferenceAttempt,
} from '@/lib/jarvis/taste/parse'
export { signalsFromEdlDiff, signalsFromWeakRejection } from '@/lib/jarvis/taste/evidence'
export {
  ingestTasteSignal,
  ingestTasteSignals,
  confirmTastePreference,
  rejectTastePreference,
  listTastePreferences,
  getTasteProfile,
  listEvidenceForPreference,
  markStaleTastePreferences,
  applySignalInMemory,
  preferenceFingerprint,
  evidenceFingerprint,
} from '@/lib/jarvis/taste/store'
export {
  retrieveTaste,
  retrieveTasteSync,
  tasteHintsToBooleans,
} from '@/lib/jarvis/taste/retrieve'
export {
  effectsFromRetrievedTaste,
  applyTasteToEdl,
  formatTasteForCreativePlan,
} from '@/lib/jarvis/taste/apply'
export { explainPreference, explainEditChoice } from '@/lib/jarvis/taste/explain'
export { recordAudienceSignal } from '@/lib/jarvis/taste/audience'
export {
  runTasteMaintenance,
  learnFromEdlRevisionEvent,
  learnFromRenderDecision,
} from '@/lib/jarvis/taste/maintenance'
