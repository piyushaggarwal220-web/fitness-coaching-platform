/**
 * Realtime turn adapter — voice/text → existing runJarvisTurn.
 * Never bypasses risk / approval / cost / action-runner.
 */

import { runJarvisTurn } from '@/lib/jarvis/core/orchestrator'
import { assertAiBudgetAvailable, recordCostUsage, getCostDashboard } from '@/lib/jarvis/cost/usage'
import { humanizeJarvisError } from '@/lib/jarvis/operator-errors'
import { humanToolLabel } from '@/lib/jarvis/operator-present'
import { describeRealtimeCapability, maxAudioSeconds } from '@/lib/jarvis/realtime/config'
import { nowIso, realtimeError, type JarvisRealtimeEvent } from '@/lib/jarvis/realtime/events'
import {
  getSpeechToTextProvider,
  getTextToSpeechProvider,
} from '@/lib/jarvis/realtime/providers'
import {
  isExplicitApprovalPhrase,
  isExplicitRejectPhrase,
  isStopSpeakingPhrase,
  sanitizeTextForSpeech,
} from '@/lib/jarvis/realtime/providers/types'
import {
  clearSpeechInterrupted,
  closeRealtimeSession,
  getCanonicalState,
  getRealtimeSession,
  isSpeechInterrupted,
  markSpeechInterrupted,
  sessionCostExhausted,
  sessionTimedOut,
  setCanonicalState,
  touchRealtimeSession,
} from '@/lib/jarvis/realtime/session'
import type { JarvisRealtimeState } from '@/lib/jarvis/realtime/types'
import type { JarvisStreamEvent } from '@/lib/jarvis/types'

export type RealtimeTurnResult = {
  events: JarvisRealtimeEvent[]
  conversationId: string | null
  assistantText: string
  speech: {
    audio_base64: string | null
    content_type: string
    interrupted: boolean
  } | null
  state: JarvisRealtimeState
  approvals: Array<{ id: string; summary: string; risk: string }>
}

function emitState(
  events: JarvisRealtimeEvent[],
  sessionId: string,
  state: JarvisRealtimeState
) {
  setCanonicalState(sessionId, state)
  events.push({ type: 'state.changed', sessionId, timestamp: nowIso(), state })
}

function mapStreamToRealtime(
  sessionId: string,
  ev: JarvisStreamEvent,
  events: JarvisRealtimeEvent[],
  approvals: Array<{ id: string; summary: string; risk: string }>
): string {
  let token = ''
  if (ev.type === 'status') {
    const msg = ev.message.toLowerCase()
    if (msg.includes('tool') || msg.includes('checking') || msg.includes('investigat')) {
      emitState(events, sessionId, 'TOOL_CALLING')
    } else if (msg.includes('approv')) {
      emitState(events, sessionId, 'WAITING_APPROVAL')
    } else if (msg.includes('verif')) {
      emitState(events, sessionId, 'VERIFYING')
    } else {
      emitState(events, sessionId, 'THINKING')
    }
  } else if (ev.type === 'tool_start') {
    emitState(events, sessionId, 'TOOL_CALLING')
    events.push({
      type: 'tool.started',
      sessionId,
      timestamp: nowIso(),
      tool: humanToolLabel(ev.tool),
    })
  } else if (ev.type === 'tool_result') {
    events.push({
      type: 'tool.completed',
      sessionId,
      timestamp: nowIso(),
      tool: humanToolLabel(ev.tool),
      ok: ev.ok,
      summary: ev.summary.slice(0, 240),
    })
  } else if (ev.type === 'approval') {
    emitState(events, sessionId, 'WAITING_APPROVAL')
    const card = ev.approval
    approvals.push({
      id: card.id,
      summary: card.action_label,
      risk: card.risk_level,
    })
    events.push({
      type: 'approval.required',
      sessionId,
      timestamp: nowIso(),
      approvalId: card.id,
      summary: card.action_label,
      risk: card.risk_level,
      cost: card.expected_cost_note ?? null,
    })
  } else if (ev.type === 'token' && ev.text) {
    token = ev.text
    events.push({
      type: 'assistant.delta',
      sessionId,
      timestamp: nowIso(),
      text: ev.text,
    })
  } else if (ev.type === 'error') {
    events.push(realtimeError(sessionId, 'JARVIS_ERROR', humanizeJarvisError(ev.error)))
    emitState(events, sessionId, 'ERROR')
  } else if (ev.type === 'cost') {
    events.push({
      type: 'cost.updated',
      sessionId,
      timestamp: nowIso(),
      estimated_cost_usd: ev.spent_usd,
      daily_spent_usd: ev.daily_spent_usd,
    })
  }
  return token
}

async function ensureSessionUsable(sessionId: string, adminUserId: string) {
  const session = await getRealtimeSession(sessionId, adminUserId)
  if (!session) {
    return { ok: false as const, code: 'SESSION_DISCONNECTED', message: 'Session not found or not yours.' }
  }
  if (session.status === 'CLOSED') {
    return { ok: false as const, code: 'SESSION_DISCONNECTED', message: 'Session is closed.' }
  }
  if (sessionTimedOut(session)) {
    await closeRealtimeSession({ sessionId, adminUserId, reason: 'timeout' })
    return {
      ok: false as const,
      code: 'SESSION_TIMEOUT',
      message: 'Realtime session timed out. Start a new voice session when ready.',
    }
  }
  if (sessionCostExhausted(session)) {
    return {
      ok: false as const,
      code: 'COST_LIMIT_REACHED',
      message: 'Realtime AI budget for this session is exhausted. Text Jarvis may still be available.',
    }
  }
  return { ok: true as const, session }
}

/**
 * Process a text or voice transcript through the existing orchestrator.
 */
export async function processRealtimeTurn(input: {
  sessionId: string
  adminUserId: string
  text: string
  inputMode: 'voice' | 'text'
  speak?: boolean
  confidence?: number | null
}): Promise<RealtimeTurnResult> {
  const events: JarvisRealtimeEvent[] = []
  const approvals: RealtimeTurnResult['approvals'] = []
  const capability = describeRealtimeCapability()

  const gate = await ensureSessionUsable(input.sessionId, input.adminUserId)
  if (!gate.ok) {
    events.push(realtimeError(input.sessionId, gate.code, gate.message))
    emitState(events, input.sessionId, 'ERROR')
    return {
      events,
      conversationId: null,
      assistantText: '',
      speech: null,
      state: 'ERROR',
      approvals,
    }
  }

  const budget = await assertAiBudgetAvailable(0.05)
  if (!budget.ok) {
    events.push(
      realtimeError(
        input.sessionId,
        'COST_LIMIT_REACHED',
        'Jarvis has reached today\'s AI budget, so realtime processing is paused.'
      )
    )
    emitState(events, input.sessionId, 'ERROR')
    return {
      events,
      conversationId: gate.session.conversation_id,
      assistantText: '',
      speech: null,
      state: 'ERROR',
      approvals,
    }
  }

  const text = input.text.trim()
  if (!text) {
    events.push(realtimeError(input.sessionId, 'TRANSCRIPTION_FAILED', 'No speech was recognized.'))
    emitState(events, input.sessionId, 'IDLE')
    return {
      events,
      conversationId: gate.session.conversation_id,
      assistantText: '',
      speech: null,
      state: 'IDLE',
      approvals,
    }
  }

  // Interrupt / stop speaking — does NOT cancel business actions
  if (isStopSpeakingPhrase(text)) {
    markSpeechInterrupted(input.sessionId)
    events.push({
      type: 'speech.interrupted',
      sessionId: input.sessionId,
      timestamp: nowIso(),
    })
    emitState(events, input.sessionId, 'INTERRUPTED')
    emitState(events, input.sessionId, 'IDLE')
    return {
      events,
      conversationId: gate.session.conversation_id,
      assistantText: '',
      speech: null,
      state: 'IDLE',
      approvals,
    }
  }

  // Explicit approval phrases only — never "haan" / "ok"
  if (isExplicitApprovalPhrase(text) || isExplicitRejectPhrase(text)) {
    events.push({
      type: 'user.transcript',
      sessionId: input.sessionId,
      timestamp: nowIso(),
      text,
      confidence: input.confidence ?? null,
      input_mode: input.inputMode,
    })
    // Still route through orchestrator so approval engine / tools handle it —
    // do not approve client-side. Soft hint in message for clarity.
    const routed = isExplicitApprovalPhrase(text)
      ? 'Approve the pending approval if one is waiting for me. Use the existing approval id. If none is pending or it expired, tell me.'
      : 'Reject the pending approval if one is waiting for me. If none is pending or it expired, tell me.'
    return runTurnBody({
      sessionId: input.sessionId,
      adminUserId: input.adminUserId,
      conversationId: gate.session.conversation_id,
      text: routed,
      displayText: text,
      inputMode: input.inputMode,
      confidence: input.confidence ?? null,
      speak: input.speak !== false && capability.modalities.voice_output === 'CONNECTED',
      events,
      approvals,
      priorCost: gate.session.estimated_cost_usd,
    })
  }

  events.push({
    type: 'user.transcript',
    sessionId: input.sessionId,
    timestamp: nowIso(),
    text,
    confidence: input.confidence ?? null,
    input_mode: input.inputMode,
  })

  return runTurnBody({
    sessionId: input.sessionId,
    adminUserId: input.adminUserId,
    conversationId: gate.session.conversation_id,
    text,
    displayText: text,
    inputMode: input.inputMode,
    confidence: input.confidence ?? null,
    speak: input.speak !== false && capability.modalities.voice_output === 'CONNECTED',
    events,
    approvals,
    priorCost: gate.session.estimated_cost_usd,
  })
}

async function runTurnBody(input: {
  sessionId: string
  adminUserId: string
  conversationId: string | null
  text: string
  displayText: string
  inputMode: 'voice' | 'text'
  confidence: number | null
  speak: boolean
  events: JarvisRealtimeEvent[]
  approvals: RealtimeTurnResult['approvals']
  priorCost: number
}): Promise<RealtimeTurnResult> {
  const { events, approvals } = input
  clearSpeechInterrupted(input.sessionId)
  emitState(events, input.sessionId, 'THINKING')
  await touchRealtimeSession(input.sessionId, { status: 'PROCESSING' })

  let assistantText = ''
  let conversationId = input.conversationId

  try {
    const result = await runJarvisTurn({
      message: input.text,
      conversationId: input.conversationId,
      actorId: input.adminUserId,
      onEvent: (ev) => {
        const token = mapStreamToRealtime(input.sessionId, ev, events, approvals)
        if (token) assistantText += token
        if (ev.type === 'message' && ev.message?.content) {
          assistantText = ev.message.content
        }
        if (ev.type === 'done') {
          conversationId = ev.conversationId
        }
      },
    })
    conversationId = result.conversationId
    if (result.assistantMessage) assistantText = result.assistantMessage
  } catch (err) {
    events.push(
      realtimeError(input.sessionId, 'JARVIS_ERROR', humanizeJarvisError(err))
    )
    emitState(events, input.sessionId, 'ERROR')
    return {
      events,
      conversationId,
      assistantText: '',
      speech: null,
      state: 'ERROR',
      approvals,
    }
  }

  events.push({
    type: 'assistant.final',
    sessionId: input.sessionId,
    timestamp: nowIso(),
    text: assistantText,
  })

  let speech: RealtimeTurnResult['speech'] = null
  if (input.speak && assistantText && !isSpeechInterrupted(input.sessionId)) {
    emitState(events, input.sessionId, 'SPEAKING')
    events.push({ type: 'speech.started', sessionId: input.sessionId, timestamp: nowIso() })
    const tts = getTextToSpeechProvider()
    const synth = await tts.synthesize({ text: sanitizeTextForSpeech(assistantText) })
    if (isSpeechInterrupted(input.sessionId)) {
      events.push({
        type: 'speech.interrupted',
        sessionId: input.sessionId,
        timestamp: nowIso(),
      })
      speech = { audio_base64: null, content_type: synth.content_type, interrupted: true }
    } else if (synth.audio_base64) {
      speech = {
        audio_base64: synth.audio_base64,
        content_type: synth.content_type,
        interrupted: false,
      }
      events.push({
        type: 'speech.completed',
        sessionId: input.sessionId,
        timestamp: nowIso(),
      })
      const audioOut = synth.duration_seconds ?? 0
      await touchRealtimeSession(input.sessionId, {
        audio_output_seconds: audioOut,
      })
      await recordCostUsage({
        provider: synth.provider,
        model: 'tts',
        conversationId,
        category: 'other',
        costUsd: Math.min(0.05, Math.max(0.002, (audioOut || 2) * 0.015 / 1000 * 15)),
        metadata: {
          kind: 'realtime_tts',
          session_id: input.sessionId,
          estimated: true,
        },
      })
    } else if (synth.error) {
      events.push(
        realtimeError(
          input.sessionId,
          synth.error,
          synth.note || 'Voice output failed. You can still read the text response.'
        )
      )
    }
  }

  const costDash = await getCostDashboard()
  const turnCostEstimate = 0.02
  const newCost = input.priorCost + turnCostEstimate
  await touchRealtimeSession(input.sessionId, {
    status: approvals.length ? 'WAITING_APPROVAL' : 'CONNECTED',
    conversation_id: conversationId,
    estimated_cost_usd: newCost,
  })
  events.push({
    type: 'cost.updated',
    sessionId: input.sessionId,
    timestamp: nowIso(),
    estimated_cost_usd: newCost,
    daily_spent_usd: costDash.daily_spent_usd,
  })

  const finalState: JarvisRealtimeState = approvals.length
    ? 'WAITING_APPROVAL'
    : getCanonicalState(input.sessionId) === 'ERROR'
      ? 'ERROR'
      : 'IDLE'
  emitState(events, input.sessionId, finalState)

  return {
    events,
    conversationId,
    assistantText,
    speech,
    state: finalState,
    approvals,
  }
}

/**
 * Transcribe push-to-talk audio then process as a voice turn.
 * Audio buffer is ephemeral — never persisted.
 */
export async function processRealtimeAudio(input: {
  sessionId: string
  adminUserId: string
  audio: Buffer
  mimeType: string
  speak?: boolean
}): Promise<RealtimeTurnResult> {
  const events: JarvisRealtimeEvent[] = []
  const capability = describeRealtimeCapability()

  if (capability.modalities.voice_input !== 'CONNECTED') {
    events.push(
      realtimeError(
        input.sessionId,
        capability.status === 'DISABLED' ? 'REALTIME_DISABLED' : 'REALTIME_NOT_CONFIGURED',
        capability.note
      )
    )
    return {
      events,
      conversationId: null,
      assistantText: '',
      speech: null,
      state: 'ERROR',
      approvals: [],
    }
  }

  const gate = await ensureSessionUsable(input.sessionId, input.adminUserId)
  if (!gate.ok) {
    events.push(realtimeError(input.sessionId, gate.code, gate.message))
    return {
      events,
      conversationId: null,
      assistantText: '',
      speech: null,
      state: 'ERROR',
      approvals: [],
    }
  }

  // Rough duration guard from byte size (~16kb/s webm opus estimate)
  const approxSeconds = Math.max(1, input.audio.byteLength / 16_000)
  if (approxSeconds > maxAudioSeconds() * 1.5) {
    events.push(
      realtimeError(
        input.sessionId,
        'TRANSCRIPTION_FAILED',
        `Audio too long. Keep push-to-talk under ${maxAudioSeconds()} seconds.`
      )
    )
    return {
      events,
      conversationId: gate.session.conversation_id,
      assistantText: '',
      speech: null,
      state: 'IDLE',
      approvals: [],
    }
  }

  emitState(events, input.sessionId, 'TRANSCRIBING')
  const stt = getSpeechToTextProvider()
  const transcript = await stt.transcribe({
    audio: input.audio,
    mimeType: input.mimeType || 'audio/webm',
  })

  if (transcript.error || !transcript.text.trim()) {
    events.push(
      realtimeError(
        input.sessionId,
        transcript.error || 'TRANSCRIPTION_FAILED',
        transcript.note || 'Could not understand that. Try again or type instead.'
      )
    )
    emitState(events, input.sessionId, 'IDLE')
    return {
      events,
      conversationId: gate.session.conversation_id,
      assistantText: '',
      speech: null,
      state: 'IDLE',
      approvals: [],
    }
  }

  await touchRealtimeSession(input.sessionId, {
    audio_input_seconds: transcript.duration_seconds ?? approxSeconds,
  })
  await recordCostUsage({
    provider: transcript.provider,
    model: 'whisper-1',
    conversationId: gate.session.conversation_id,
    category: 'other',
    costUsd: 0.006 * ((transcript.duration_seconds ?? approxSeconds) / 60),
    metadata: {
      kind: 'realtime_stt',
      session_id: input.sessionId,
      estimated: true,
      language: transcript.language,
      // never store audio
    },
  })

  const turn = await processRealtimeTurn({
    sessionId: input.sessionId,
    adminUserId: input.adminUserId,
    text: transcript.text,
    inputMode: 'voice',
    speak: input.speak,
    confidence: transcript.confidence,
  })

  return {
    ...turn,
    events: [...events, ...turn.events],
  }
}

export async function interruptRealtimeSpeech(input: {
  sessionId: string
  adminUserId: string
}): Promise<JarvisRealtimeEvent[]> {
  const events: JarvisRealtimeEvent[] = []
  const session = await getRealtimeSession(input.sessionId, input.adminUserId)
  if (!session) {
    events.push(
      realtimeError(input.sessionId, 'SESSION_DISCONNECTED', 'Session not found.')
    )
    return events
  }
  markSpeechInterrupted(input.sessionId)
  events.push({
    type: 'speech.interrupted',
    sessionId: input.sessionId,
    timestamp: nowIso(),
  })
  emitState(events, input.sessionId, 'INTERRUPTED')
  emitState(events, input.sessionId, 'IDLE')
  // Explicit: business actions are NOT cancelled here.
  return events
}
