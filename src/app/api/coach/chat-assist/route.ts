import { NextResponse } from 'next/server'
import { requireConversationParticipant } from '@/lib/chat-api-access'
import { publishPlanFromCoachChat, summarizeCoachChat } from '@/lib/coach-chat-assist'

export const runtime = 'nodejs'
export const maxDuration = 300

async function coachAccess(conversationId: string) {
  const access = await requireConversationParticipant(conversationId)
  if (!access.ok) return access
  if (access.participant.viewer !== 'coach') {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Coach access required.' }, { status: 403 }),
    }
  }
  return access
}

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get('conversationId')?.trim() ?? ''
  if (!conversationId) {
    return NextResponse.json({ success: false, error: 'conversationId required' }, { status: 400 })
  }
  const access = await coachAccess(conversationId)
  if (!access.ok) return access.response

  try {
    const summary = await summarizeCoachChat(access.admin, {
      clientId: access.participant.conversation.client_id,
      conversationId,
    })
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Summary failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

const MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePlanEditBody(value: unknown): { conversationId: string; messageIds: string[]; coachComment: string } | { error: string } {
  if (!value || typeof value !== 'object') return { error: 'Invalid JSON body' }
  const body = value as { conversationId?: unknown; messageIds?: unknown; coachComment?: unknown }
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
  if (!conversationId) return { error: 'conversationId required' }
  if (!Array.isArray(body.messageIds) || body.messageIds.length > 40) {
    return { error: 'Select the messages to use as the reference.' }
  }
  const rawIds = body.messageIds.filter((id): id is string => typeof id === 'string')
  if (rawIds.length !== body.messageIds.length) {
    return { error: 'Select the messages to use as the reference.' }
  }
  const messageIds = [...new Set(rawIds)]
  if (messageIds.some((id) => !MESSAGE_ID.test(id))) {
    return { error: 'Select the messages to use as the reference.' }
  }
  if (body.coachComment != null && typeof body.coachComment !== 'string') {
    return { error: 'Comments must be text.' }
  }
  const coachComment = typeof body.coachComment === 'string' ? body.coachComment.trim() : ''
  if (coachComment.length > 1500) return { error: 'Comments are too long.' }
  if (messageIds.length === 0 && !coachComment) {
    return { error: 'Select the messages to use, or write a comment.' }
  }
  return { conversationId, messageIds, coachComment }
}

export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const body = parsePlanEditBody(raw)
  if ('error' in body) {
    return NextResponse.json({ success: false, error: body.error }, { status: 400 })
  }
  const access = await coachAccess(body.conversationId)
  if (!access.ok) return access.response

  try {
    const result = await publishPlanFromCoachChat(access.admin, {
      clientId: access.participant.conversation.client_id,
      conversationId: body.conversationId,
      coachId: access.participant.coachId,
      messageIds: body.messageIds,
      coachComment: body.coachComment,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plan update failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
