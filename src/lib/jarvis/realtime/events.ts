/**
 * Canonical realtime events — typed, secret-free, UI-consumable.
 */

import type { JarvisRealtimeState, RealtimeProviderStatus } from '@/lib/jarvis/realtime/types'

export type JarvisRealtimeEvent =
  | { type: 'session.started'; sessionId: string; timestamp: string; conversationId: string | null }
  | { type: 'session.connected'; sessionId: string; timestamp: string; status: RealtimeProviderStatus }
  | { type: 'session.closed'; sessionId: string; timestamp: string; reason: string }
  | { type: 'state.changed'; sessionId: string; timestamp: string; state: JarvisRealtimeState }
  | {
      type: 'user.transcript'
      sessionId: string
      timestamp: string
      text: string
      confidence: number | null
      input_mode: 'voice' | 'text'
    }
  | { type: 'assistant.delta'; sessionId: string; timestamp: string; text: string }
  | { type: 'assistant.final'; sessionId: string; timestamp: string; text: string }
  | { type: 'tool.started'; sessionId: string; timestamp: string; tool: string }
  | { type: 'tool.completed'; sessionId: string; timestamp: string; tool: string; ok: boolean; summary: string }
  | {
      type: 'approval.required'
      sessionId: string
      timestamp: string
      approvalId: string
      summary: string
      risk: string
      cost: string | null
    }
  | { type: 'provider.status'; sessionId: string; timestamp: string; status: RealtimeProviderStatus; detail: string }
  | { type: 'cost.updated'; sessionId: string; timestamp: string; estimated_cost_usd: number; daily_spent_usd: number | null }
  | { type: 'error'; sessionId: string; timestamp: string; code: string; message: string }
  | { type: 'speech.started'; sessionId: string; timestamp: string }
  | { type: 'speech.interrupted'; sessionId: string; timestamp: string }
  | { type: 'speech.completed'; sessionId: string; timestamp: string }

export function nowIso() {
  return new Date().toISOString()
}

export function realtimeError(
  sessionId: string,
  code: string,
  message: string
): JarvisRealtimeEvent {
  return { type: 'error', sessionId, timestamp: nowIso(), code, message }
}
