/**
 * Phase 11 — Jarvis realtime interface types.
 * Interface only — business decisions stay in the existing orchestrator.
 */

export type RealtimeProviderStatus =
  | 'CONNECTED'
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'DEGRADED'
  | 'ERROR'
  | 'UNKNOWN'

export type JarvisRealtimeState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'TOOL_CALLING'
  | 'WAITING_APPROVAL'
  | 'ACTING'
  | 'VERIFYING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR'

export type RealtimeSessionStatus =
  | 'CREATED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'LISTENING'
  | 'PROCESSING'
  | 'WAITING_APPROVAL'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'CLOSED'

export type ModalityStatus = {
  text: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE'
  voice_input: RealtimeProviderStatus
  voice_output: RealtimeProviderStatus
  realtime: RealtimeProviderStatus
}

export type TranscriptionResult = {
  text: string
  confidence: number | null
  language: string | null
  duration_seconds: number | null
  provider: string
  data_status: 'verified' | 'unavailable' | 'failed'
  note?: string
  error?: string
}

export type SynthesisResult = {
  audio_base64: string | null
  content_type: string
  provider: string
  duration_seconds: number | null
  data_status: 'verified' | 'unavailable' | 'failed'
  note?: string
  error?: string
}

export type RealtimeSessionRecord = {
  id: string
  conversation_id: string | null
  admin_user_id: string
  provider: string
  model: string | null
  status: RealtimeSessionStatus
  started_at: string
  last_activity_at: string
  ended_at: string | null
  duration_seconds: number | null
  input_tokens: number
  output_tokens: number
  audio_input_seconds: number
  audio_output_seconds: number
  estimated_cost_usd: number
  termination_reason: string | null
  metadata: Record<string, unknown>
}

export type RealtimeCapabilitySnapshot = {
  enabled: boolean
  provider: string
  model: string | null
  status: RealtimeProviderStatus
  modalities: ModalityStatus
  note: string
  missing: string[]
  max_session_minutes: number
  max_audio_seconds: number
  max_realtime_cost_usd: number
}
