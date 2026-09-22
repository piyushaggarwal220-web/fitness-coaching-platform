/**
 * Phase 11 — Realtime voice/text interface (transport only).
 */

export { describeRealtimeCapability, realtimeEnabled } from '@/lib/jarvis/realtime/config'
export type {
  RealtimeCapabilitySnapshot,
  RealtimeProviderStatus,
  JarvisRealtimeState,
  RealtimeSessionRecord,
  TranscriptionResult,
  SynthesisResult,
} from '@/lib/jarvis/realtime/types'
export type { JarvisRealtimeEvent } from '@/lib/jarvis/realtime/events'
export {
  createRealtimeSession,
  closeRealtimeSession,
  getRealtimeSession,
  markSpeechInterrupted,
  isSpeechInterrupted,
  getCanonicalState,
} from '@/lib/jarvis/realtime/session'
export {
  processRealtimeTurn,
  processRealtimeAudio,
  interruptRealtimeSpeech,
} from '@/lib/jarvis/realtime/turn'
export {
  getSpeechToTextProvider,
  getTextToSpeechProvider,
} from '@/lib/jarvis/realtime/providers'
export {
  sanitizeTextForSpeech,
  isExplicitApprovalPhrase,
  isExplicitRejectPhrase,
  isStopSpeakingPhrase,
} from '@/lib/jarvis/realtime/providers/types'
export {
  MockSpeechToTextProvider,
  MockTextToSpeechProvider,
} from '@/lib/jarvis/realtime/providers/mock'
