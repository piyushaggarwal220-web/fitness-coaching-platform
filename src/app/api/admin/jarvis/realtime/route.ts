/**
 * Phase 11 realtime session API — auth via requireMarketingAdmin.
 * Voice/text → existing Jarvis orchestrator. No second brain.
 */

import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'
import { describeRealtimeCapability } from '@/lib/jarvis/realtime/config'
import {
  closeRealtimeSession,
  createRealtimeSession,
  getRealtimeSession,
  getCanonicalState,
} from '@/lib/jarvis/realtime/session'
import {
  interruptRealtimeSpeech,
  processRealtimeAudio,
  processRealtimeTurn,
} from '@/lib/jarvis/realtime/turn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function publicSession(session: {
  id: string
  conversation_id: string | null
  provider: string
  model: string | null
  status: string
  started_at: string
  last_activity_at: string
  ended_at: string | null
  duration_seconds: number | null
  estimated_cost_usd: number
  audio_input_seconds: number
  audio_output_seconds: number
  termination_reason: string | null
}) {
  return {
    id: session.id,
    conversation_id: session.conversation_id,
    provider: session.provider,
    model: session.model,
    status: session.status,
    started_at: session.started_at,
    last_activity_at: session.last_activity_at,
    ended_at: session.ended_at,
    duration_seconds: session.duration_seconds,
    estimated_cost_usd: session.estimated_cost_usd,
    audio_input_seconds: session.audio_input_seconds,
    audio_output_seconds: session.audio_output_seconds,
    termination_reason: session.termination_reason,
    state: getCanonicalState(session.id),
  }
}

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const capability = describeRealtimeCapability()
  return NextResponse.json({
    success: true,
    realtime: capability,
    live_meta_execution: liveMetaExecutionEnabled(),
    live_instagram_publishing: liveInstagramPublishingEnabled(),
    note: 'Push-to-talk → STT → existing Jarvis orchestrator → optional TTS. Voice never bypasses approval or cost.',
  })
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const contentType = request.headers.get('content-type') || ''

  // Multipart audio upload for push-to-talk
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const action = String(form.get('action') || 'audio')
    const sessionId = String(form.get('sessionId') || '')
    const speak = String(form.get('speak') || 'true') !== 'false'
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId required' }, { status: 400 })
    }
    if (action !== 'audio') {
      return NextResponse.json({ success: false, error: 'unsupported_action' }, { status: 400 })
    }
    const file = form.get('audio')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: 'audio required' }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || 'audio/webm'
    const result = await processRealtimeAudio({
      sessionId,
      adminUserId: auth.user.id,
      audio: buf,
      mimeType,
      speak,
    })
    return NextResponse.json({
      success: !result.events.some((e) => e.type === 'error'),
      conversationId: result.conversationId,
      assistantText: result.assistantText,
      state: result.state,
      approvals: result.approvals,
      events: result.events,
      speech: result.speech,
      live_meta_execution: liveMetaExecutionEnabled(),
      live_instagram_publishing: liveInstagramPublishingEnabled(),
    })
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    sessionId?: string
    conversationId?: string
    message?: string
    speak?: boolean
    reason?: string
  }

  const action = body.action || 'status'

  if (action === 'capability' || action === 'status') {
    return NextResponse.json({
      success: true,
      realtime: describeRealtimeCapability(),
      live_meta_execution: liveMetaExecutionEnabled(),
      live_instagram_publishing: liveInstagramPublishingEnabled(),
    })
  }

  if (action === 'create') {
    const created = await createRealtimeSession({
      adminUserId: auth.user.id,
      conversationId: body.conversationId ?? null,
    })
    if (!created.ok || !created.session) {
      return NextResponse.json(
        {
          success: false,
          error: created.error,
          code: created.code,
          realtime: created.capability,
        },
        { status: created.code === 'REALTIME_DISABLED' ? 403 : 400 }
      )
    }
    return NextResponse.json({
      success: true,
      session: publicSession(created.session),
      realtime: created.capability,
      events: [
        {
          type: 'session.started',
          sessionId: created.session.id,
          timestamp: new Date().toISOString(),
          conversationId: created.session.conversation_id,
        },
        {
          type: 'session.connected',
          sessionId: created.session.id,
          timestamp: new Date().toISOString(),
          status: created.capability.status,
        },
      ],
    })
  }

  if (action === 'get' && body.sessionId) {
    const session = await getRealtimeSession(body.sessionId, auth.user.id)
    if (!session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({
      success: true,
      session: publicSession(session),
      realtime: describeRealtimeCapability(),
    })
  }

  if (action === 'message' && body.sessionId && body.message?.trim()) {
    const result = await processRealtimeTurn({
      sessionId: body.sessionId,
      adminUserId: auth.user.id,
      text: body.message.trim(),
      inputMode: 'text',
      speak: body.speak !== false,
    })
    return NextResponse.json({
      success: !result.events.some((e) => e.type === 'error'),
      conversationId: result.conversationId,
      assistantText: result.assistantText,
      state: result.state,
      approvals: result.approvals,
      events: result.events,
      speech: result.speech,
      live_meta_execution: liveMetaExecutionEnabled(),
      live_instagram_publishing: liveInstagramPublishingEnabled(),
    })
  }

  if (action === 'interrupt' && body.sessionId) {
    const events = await interruptRealtimeSpeech({
      sessionId: body.sessionId,
      adminUserId: auth.user.id,
    })
    return NextResponse.json({
      success: true,
      events,
      note: 'Speech interrupted. Running business actions are not cancelled.',
    })
  }

  if (action === 'close' && body.sessionId) {
    const closed = await closeRealtimeSession({
      sessionId: body.sessionId,
      adminUserId: auth.user.id,
      reason: body.reason || 'user_close',
    })
    return NextResponse.json({
      success: true,
      session: closed ? publicSession(closed) : null,
      events: closed
        ? [
            {
              type: 'session.closed',
              sessionId: body.sessionId,
              timestamp: new Date().toISOString(),
              reason: body.reason || 'user_close',
            },
          ]
        : [],
    })
  }

  return NextResponse.json({ success: false, error: 'unsupported_action' }, { status: 400 })
}
