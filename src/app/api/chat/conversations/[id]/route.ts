import { NextResponse } from 'next/server'
import { requireConversationParticipant } from '@/lib/chat-api-access'
import { ensureClientMidWeekCheckinsInCoachChat } from '@/lib/coach-chat'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const conversationId = id?.trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation id required' }, { status: 400 })
  }

  const access = await requireConversationParticipant(conversationId)
  if (!access.ok) return access.response

  const { admin, participant } = access

  // When a coach opens the thread, make every mid-week check-in visible in chat.
  if (participant.viewer === 'coach') {
    const backfill = await ensureClientMidWeekCheckinsInCoachChat({
      clientId: participant.conversation.client_id,
      coachId: participant.conversation.coach_id,
    })
    if (backfill.error) {
      console.error('[chat-conversation] mid-week backfill failed', backfill.error)
    }
  }

  const [{ data: profile, error: profileError }, { data: activePlan, error: planError }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('name, phone')
        .eq('id', participant.conversation.client_id)
        .maybeSingle(),
      admin
        .from('plans')
        .select('id')
        .eq('client_id', participant.conversation.client_id)
        .eq('coach_id', participant.conversation.coach_id)
        .eq('active', true)
        .maybeSingle(),
    ])

  if (profileError || planError) {
    console.error('[chat-conversation] metadata lookup failed', {
      conversationId,
      profileError: profileError?.message,
      planError: planError?.message,
    })
    return NextResponse.json(
      { error: 'Conversation details are temporarily unavailable. Please retry.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    conversation: participant.conversation,
    viewer: participant.viewer,
    client: {
      name: profile?.name ?? 'Client',
      phone: profile?.phone ?? null,
    },
    activePlanId: activePlan?.id ?? null,
  })
}
