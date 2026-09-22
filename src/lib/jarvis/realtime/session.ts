/**
 * Realtime session persistence — temporary transport sessions, not a second brain.
 * Raw audio is never stored.
 */

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  describeRealtimeCapability,
  maxRealtimeCostUsd,
  maxSessionMinutes,
  realtimeModel,
  realtimeProviderName,
} from '@/lib/jarvis/realtime/config'
import type {
  JarvisRealtimeState,
  RealtimeSessionRecord,
  RealtimeSessionStatus,
} from '@/lib/jarvis/realtime/types'

/** In-memory interrupt flags — interrupt TTS only, never cancel business actions. */
const interruptFlags = new Map<string, boolean>()
const canonicalState = new Map<string, JarvisRealtimeState>()
/** Process-local session cache (also covers pre-migration / ephemeral sessions). */
const sessionCache = new Map<string, RealtimeSessionRecord>()

export function markSpeechInterrupted(sessionId: string) {
  interruptFlags.set(sessionId, true)
}

export function clearSpeechInterrupted(sessionId: string) {
  interruptFlags.delete(sessionId)
}

export function isSpeechInterrupted(sessionId: string): boolean {
  return interruptFlags.get(sessionId) === true
}

export function setCanonicalState(sessionId: string, state: JarvisRealtimeState) {
  canonicalState.set(sessionId, state)
}

export function getCanonicalState(sessionId: string): JarvisRealtimeState {
  return canonicalState.get(sessionId) ?? 'IDLE'
}

function cacheSession(session: RealtimeSessionRecord) {
  sessionCache.set(session.id, session)
}

function rowToRecord(row: Record<string, unknown>): RealtimeSessionRecord {
  return {
    id: String(row.id),
    conversation_id: (row.conversation_id as string | null) ?? null,
    admin_user_id: String(row.admin_user_id),
    provider: String(row.provider ?? 'unknown'),
    model: (row.model as string | null) ?? null,
    status: (row.status as RealtimeSessionStatus) ?? 'CREATED',
    started_at: String(row.started_at),
    last_activity_at: String(row.last_activity_at),
    ended_at: (row.ended_at as string | null) ?? null,
    duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    input_tokens: Number(row.input_tokens ?? 0),
    output_tokens: Number(row.output_tokens ?? 0),
    audio_input_seconds: Number(row.audio_input_seconds ?? 0),
    audio_output_seconds: Number(row.audio_output_seconds ?? 0),
    estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
    termination_reason: (row.termination_reason as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }
}

export async function createRealtimeSession(input: {
  adminUserId: string
  conversationId?: string | null
}): Promise<{
  ok: boolean
  session?: RealtimeSessionRecord
  capability: ReturnType<typeof describeRealtimeCapability>
  error?: string
  code?: string
}> {
  const capability = describeRealtimeCapability()
  if (!capability.enabled) {
    return {
      ok: false,
      capability,
      error: 'Voice is disabled. Text Jarvis is still available.',
      code: 'REALTIME_DISABLED',
    }
  }
  if (capability.status === 'NOT_CONFIGURED') {
    return {
      ok: false,
      capability,
      error: capability.note,
      code: 'REALTIME_NOT_CONFIGURED',
    }
  }

  const now = new Date().toISOString()
  const id = randomUUID()
  const insert = {
    id,
    conversation_id: input.conversationId ?? null,
    admin_user_id: input.adminUserId,
    provider: realtimeProviderName(),
    model: realtimeModel() || 'whisper-1 / tts-1',
    status: 'CONNECTED' as RealtimeSessionStatus,
    started_at: now,
    last_activity_at: now,
    metadata: {
      max_session_minutes: maxSessionMinutes(),
      max_realtime_cost_usd: maxRealtimeCostUsd(),
    },
  }

  // Mock provider: keep sessions in-process only (deterministic verifies, no DB required).
  if (realtimeProviderName() === 'mock') {
    const ephemeral: RealtimeSessionRecord = {
      ...insert,
      ended_at: null,
      duration_seconds: null,
      input_tokens: 0,
      output_tokens: 0,
      audio_input_seconds: 0,
      audio_output_seconds: 0,
      estimated_cost_usd: 0,
      termination_reason: null,
      metadata: { ...insert.metadata, ephemeral: true, mock: true },
    }
    cacheSession(ephemeral)
    setCanonicalState(id, 'IDLE')
    return { ok: true, session: ephemeral, capability }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_realtime_sessions')
    .insert(insert)
    .select('*')
    .maybeSingle()

  if (error) {
    // Table may be missing before migration — fall back to ephemeral session for local/dev
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      const ephemeral: RealtimeSessionRecord = {
        ...insert,
        ended_at: null,
        duration_seconds: null,
        input_tokens: 0,
        output_tokens: 0,
        audio_input_seconds: 0,
        audio_output_seconds: 0,
        estimated_cost_usd: 0,
        termination_reason: null,
        metadata: { ...insert.metadata, ephemeral: true },
      }
      cacheSession(ephemeral)
      setCanonicalState(id, 'IDLE')
      return { ok: true, session: ephemeral, capability }
    }
    return {
      ok: false,
      capability,
      error: 'Could not create realtime session.',
      code: 'JARVIS_ERROR',
    }
  }

  const session = rowToRecord(data as Record<string, unknown>)
  cacheSession(session)
  setCanonicalState(session.id, 'IDLE')
  return { ok: true, session, capability }
}

export async function getRealtimeSession(
  sessionId: string,
  adminUserId: string
): Promise<RealtimeSessionRecord | null> {
  const cached = sessionCache.get(sessionId)
  if (cached) {
    if (cached.admin_user_id !== adminUserId) return null
    return cached
  }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_realtime_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('admin_user_id', adminUserId)
    .maybeSingle()
  if (error || !data) return null
  const session = rowToRecord(data as Record<string, unknown>)
  cacheSession(session)
  return session
}

export async function touchRealtimeSession(
  sessionId: string,
  patch: Partial<{
    status: RealtimeSessionStatus
    conversation_id: string | null
    input_tokens: number
    output_tokens: number
    audio_input_seconds: number
    audio_output_seconds: number
    estimated_cost_usd: number
    metadata: Record<string, unknown>
  }>
): Promise<void> {
  const cached = sessionCache.get(sessionId)
  const now = new Date().toISOString()
  let next: RealtimeSessionRecord | null = cached
    ? {
        ...cached,
        status: patch.status ?? cached.status,
        conversation_id:
          patch.conversation_id !== undefined
            ? patch.conversation_id
            : cached.conversation_id,
        input_tokens: patch.input_tokens ?? cached.input_tokens,
        output_tokens: patch.output_tokens ?? cached.output_tokens,
        audio_input_seconds:
          patch.audio_input_seconds != null
            ? cached.audio_input_seconds + patch.audio_input_seconds
            : cached.audio_input_seconds,
        audio_output_seconds:
          patch.audio_output_seconds != null
            ? cached.audio_output_seconds + patch.audio_output_seconds
            : cached.audio_output_seconds,
        estimated_cost_usd: patch.estimated_cost_usd ?? cached.estimated_cost_usd,
        last_activity_at: now,
        metadata: patch.metadata
          ? { ...cached.metadata, ...patch.metadata }
          : cached.metadata,
      }
    : null
  if (next) cacheSession(next)

  if (next?.metadata?.ephemeral || next?.metadata?.mock) return

  try {
    const admin = createAdminClient()
    const dbPatch = next
      ? {
          status: next.status,
          conversation_id: next.conversation_id,
          input_tokens: next.input_tokens,
          output_tokens: next.output_tokens,
          audio_input_seconds: next.audio_input_seconds,
          audio_output_seconds: next.audio_output_seconds,
          estimated_cost_usd: next.estimated_cost_usd,
          metadata: next.metadata,
          last_activity_at: now,
          updated_at: now,
        }
      : {
          ...patch,
          last_activity_at: now,
          updated_at: now,
        }
    await admin.from('jarvis_realtime_sessions').update(dbPatch).eq('id', sessionId)
  } catch {
    // Missing env / table — in-memory cache is authoritative for this process
  }
}

export function sessionTimedOut(session: RealtimeSessionRecord): boolean {
  const maxMs = maxSessionMinutes() * 60_000
  const started = Date.parse(session.started_at)
  if (!Number.isFinite(started)) return true
  if (Date.now() - started > maxMs) return true
  const inactiveMs = 10 * 60_000
  const last = Date.parse(session.last_activity_at)
  if (Number.isFinite(last) && Date.now() - last > inactiveMs) return true
  return false
}

export function sessionCostExhausted(session: RealtimeSessionRecord): boolean {
  return session.estimated_cost_usd >= maxRealtimeCostUsd()
}

export async function closeRealtimeSession(input: {
  sessionId: string
  adminUserId: string
  reason: string
}): Promise<RealtimeSessionRecord | null> {
  const session = await getRealtimeSession(input.sessionId, input.adminUserId)
  if (!session) {
    interruptFlags.delete(input.sessionId)
    canonicalState.delete(input.sessionId)
    sessionCache.delete(input.sessionId)
    return null
  }
  if (session.status === 'CLOSED') return session

  const ended = new Date()
  const started = Date.parse(session.started_at)
  const duration = Number.isFinite(started)
    ? Math.max(0, Math.round((ended.getTime() - started) / 1000))
    : null

  const closed: RealtimeSessionRecord = {
    ...session,
    status: 'CLOSED',
    ended_at: ended.toISOString(),
    duration_seconds: duration,
    termination_reason: input.reason,
    last_activity_at: ended.toISOString(),
  }
  cacheSession(closed)

  if (!session.metadata?.ephemeral && !session.metadata?.mock) {
    try {
      const admin = createAdminClient()
      await admin
        .from('jarvis_realtime_sessions')
        .update({
          status: 'CLOSED',
          ended_at: ended.toISOString(),
          duration_seconds: duration,
          termination_reason: input.reason,
          last_activity_at: ended.toISOString(),
          updated_at: ended.toISOString(),
        })
        .eq('id', input.sessionId)
        .eq('admin_user_id', input.adminUserId)
    } catch {
      // Ephemeral / missing env — cache already closed
    }
  }

  interruptFlags.delete(input.sessionId)
  setCanonicalState(input.sessionId, 'IDLE')
  canonicalState.delete(input.sessionId)

  return closed
}
