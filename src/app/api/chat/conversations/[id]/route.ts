import { NextResponse } from 'next/server'
import { requireConversationParticipant } from '@/lib/chat-api-access'
import { buildPlanSlugByClient } from '@/lib/client-plan-tier'
import type { AccessSource } from '@/lib/entitlements'

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
  const clientId = participant.conversation.client_id
  const [{ data: profile, error: profileError }, { data: activePlan, error: planError }, { data: purchases }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('name, phone, access_source')
        .eq('id', clientId)
        .maybeSingle(),
      admin
        .from('plans')
        .select('id')
        .eq('client_id', clientId)
        .eq('coach_id', participant.conversation.coach_id)
        .eq('active', true)
        .maybeSingle(),
      admin
        .from('purchases')
        .select('user_id, plan_slug, status, created_at')
        .eq('user_id', clientId)
        .in('status', ['captured', 'redeemed']),
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

  const planSlug = buildPlanSlugByClient(purchases).get(clientId) ?? null

  return NextResponse.json({
    conversation: participant.conversation,
    viewer: participant.viewer,
    client: {
      name: profile?.name ?? 'Client',
      phone: profile?.phone ?? null,
    },
    activePlanId: activePlan?.id ?? null,
    plan_slug: planSlug,
    access_source: (profile?.access_source as AccessSource | null) ?? null,
  })
}
