import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { storeVideoSource, listVideoSources, MAX_VIDEO_UPLOAD_BYTES } from '@/lib/jarvis/video/sources'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import {
  createVideoSession,
  ingestSourceIntoSession,
  listVideoSessions,
  getVideoSession,
} from '@/lib/jarvis/video/intelligence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const sessionId = url.searchParams.get('sessionId')
  if (sessionId) {
    const detail = await getVideoSession(sessionId)
    if (!detail) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, ...detail })
  }

  const [sources, sessions] = await Promise.all([listVideoSources(30), listVideoSessions(20)])
  return NextResponse.json({ success: true, sources, sessions })
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const contentType = request.headers.get('content-type') || ''

  // JSON: create session
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      title?: string
      description?: string
    }
    if (body.action === 'create_session' || body.title) {
      if (!body.title?.trim()) {
        return NextResponse.json({ success: false, error: 'title required' }, { status: 400 })
      }
      const session = await createVideoSession({
        title: body.title.trim(),
        description: body.description,
        actorId: auth.user.id,
      })
      return NextResponse.json({ success: true, session })
    }
    return NextResponse.json({ success: false, error: 'Unknown JSON action' }, { status: 400 })
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'file required' }, { status: 400 })
  }
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    return NextResponse.json(
      { success: false, error: `File too large (max ${MAX_VIDEO_UPLOAD_BYTES} bytes)` },
      { status: 400 }
    )
  }

  const sessionId = String(form.get('sessionId') || form.get('session_id') || '').trim() || null
  const bytes = Buffer.from(await file.arrayBuffer())

  let result: {
    ok: boolean
    source_ref?: string
    id?: string
    duplicate_of?: string
    error?: string
    public_url_exposed: false
  }

  if (sessionId) {
    result = await ingestSourceIntoSession({
      sessionId,
      bytes,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      actorId: auth.user.id,
    })
  } else {
    result = await storeVideoSource({
      bytes,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      actorId: auth.user.id,
    })
  }

  await writeMarketingAudit({
    agent: 'video',
    decision: result.ok ? 'video_source_uploaded' : 'video_source_rejected',
    action: 'video_upload',
    actor_id: auth.user.id,
    error: result.error ?? null,
    execution_result: {
      source_ref: result.source_ref ?? null,
      session_id: sessionId,
      duplicate_of: result.duplicate_of ?? null,
      public_url_exposed: false,
    },
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    source_ref: result.source_ref,
    id: result.id,
    session_id: sessionId,
    duplicate_of: result.duplicate_of ?? null,
    public_url_exposed: false,
    note: sessionId
      ? 'Source attached to session. Call video.analyze with sessionId to start intelligence pipeline.'
      : 'Source stored privately. Use source_ref with video.create_edit_job / video.analyze.',
  })
}
