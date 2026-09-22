/**
 * Realtime feature configuration — explicit enable flag required.
 * OPENAI_API_KEY alone does NOT turn voice on.
 */

import type { RealtimeCapabilitySnapshot, RealtimeProviderStatus } from '@/lib/jarvis/realtime/types'

export function realtimeEnabled(): boolean {
  return (process.env.JARVIS_REALTIME_ENABLED || '').trim().toLowerCase() === 'true'
}

export function realtimeProviderName(): string {
  const p = (process.env.JARVIS_REALTIME_PROVIDER || '').trim().toLowerCase()
  if (p) return p
  return 'openai'
}

export function realtimeModel(): string | null {
  const m = (process.env.JARVIS_REALTIME_MODEL || '').trim()
  return m || null
}

export function maxSessionMinutes(): number {
  const n = Number(process.env.JARVIS_REALTIME_MAX_SESSION_MINUTES || 20)
  return Number.isFinite(n) && n > 0 ? Math.min(120, n) : 20
}

export function maxAudioSeconds(): number {
  const n = Number(process.env.JARVIS_REALTIME_MAX_AUDIO_SECONDS || 60)
  return Number.isFinite(n) && n > 0 ? Math.min(180, n) : 60
}

export function maxRealtimeCostUsd(): number {
  const n = Number(process.env.JARVIS_REALTIME_MAX_COST_USD || 1)
  return Number.isFinite(n) && n > 0 ? Math.min(50, n) : 1
}

export function describeRealtimeCapability(): RealtimeCapabilitySnapshot {
  const enabled = realtimeEnabled()
  const provider = realtimeProviderName()
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim())
  const missing: string[] = []

  if (!enabled) {
    return {
      enabled: false,
      provider,
      model: realtimeModel(),
      status: 'DISABLED',
      modalities: {
        text: 'AVAILABLE',
        voice_input: 'DISABLED',
        voice_output: 'DISABLED',
        realtime: 'DISABLED',
      },
      note: 'JARVIS_REALTIME_ENABLED is not true. Text Jarvis remains available. Set JARVIS_REALTIME_ENABLED=true plus OPENAI_API_KEY to enable push-to-talk voice.',
      missing: ['JARVIS_REALTIME_ENABLED=true'],
      max_session_minutes: maxSessionMinutes(),
      max_audio_seconds: maxAudioSeconds(),
      max_realtime_cost_usd: maxRealtimeCostUsd(),
    }
  }

  if (provider === 'openai' && !hasKey) {
    missing.push('OPENAI_API_KEY')
  }
  if (provider === 'mock') {
    return {
      enabled: true,
      provider: 'mock',
      model: 'mock',
      status: 'CONNECTED',
      modalities: {
        text: 'AVAILABLE',
        voice_input: 'CONNECTED',
        voice_output: 'CONNECTED',
        realtime: 'CONNECTED',
      },
      note: 'Mock realtime provider (tests only — not production).',
      missing: [],
      max_session_minutes: maxSessionMinutes(),
      max_audio_seconds: maxAudioSeconds(),
      max_realtime_cost_usd: maxRealtimeCostUsd(),
    }
  }

  if (missing.length) {
    return {
      enabled: true,
      provider,
      model: realtimeModel(),
      status: 'NOT_CONFIGURED',
      modalities: {
        text: 'AVAILABLE',
        voice_input: 'NOT_CONFIGURED',
        voice_output: 'NOT_CONFIGURED',
        realtime: 'NOT_CONFIGURED',
      },
      note: `Realtime enabled but provider credentials missing: ${missing.join(', ')}. Text Jarvis remains available.`,
      missing,
      max_session_minutes: maxSessionMinutes(),
      max_audio_seconds: maxAudioSeconds(),
      max_realtime_cost_usd: maxRealtimeCostUsd(),
    }
  }

  const status: RealtimeProviderStatus = 'CONNECTED'
  return {
    enabled: true,
    provider,
    model: realtimeModel() || 'whisper-1 / tts-1',
    status,
    modalities: {
      text: 'AVAILABLE',
      voice_input: status,
      voice_output: status,
      realtime: status,
    },
    note:
      'Push-to-talk voice uses server-side STT → existing Jarvis orchestrator → optional TTS. Voice never bypasses approval, cost, or live Meta/Instagram flags.',
    missing: [],
    max_session_minutes: maxSessionMinutes(),
    max_audio_seconds: maxAudioSeconds(),
    max_realtime_cost_usd: maxRealtimeCostUsd(),
  }
}
