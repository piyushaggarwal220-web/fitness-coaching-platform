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

export async function POST(request: Request) {
  let body: { conversationId?: string }
  try {
    body = (await request.json()) as { conversationId?: string }
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const conversationId = body.conversationId?.trim() ?? ''
  if (!conversationId) {
    return NextResponse.json({ success: false, error: 'conversationId required' }, { status: 400 })
  }
  const access = await coachAccess(conversationId)
  if (!access.ok) return access.response

  try {
    const result = await publishPlanFromCoachChat(access.admin, {
      clientId: access.participant.conversation.client_id,
      conversationId,
      coachId: access.participant.coachId,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plan update failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
