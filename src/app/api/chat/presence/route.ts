import { NextResponse } from 'next/server'
import { requireConversationParticipant } from '@/lib/chat-api-access'

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get('conversationId')?.trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }

  const access = await requireConversationParticipant(conversationId)
  if (!access.ok) return access.response
  const { admin, participant } = access
  if (participant.viewer === 'coach') {
    const { data: profile, error } = await admin
      .from('profiles')
      .select('last_seen_at')
      .eq('id', participant.conversation.client_id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Presence is temporarily unavailable.' }, { status: 500 })
    return NextResponse.json({ viewer: 'coach', peerLastSeenAt: profile?.last_seen_at ?? null })
  }

  const { data: coach, error } = await admin
    .from('coaches')
    .select('last_seen_at')
    .eq('id', participant.conversation.coach_id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Presence is temporarily unavailable.' }, { status: 500 })
  return NextResponse.json({ viewer: 'client', peerLastSeenAt: coach?.last_seen_at ?? null })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { conversationId?: string } | null
  const conversationId = body?.conversationId?.trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }

  const access = await requireConversationParticipant(conversationId)
  if (!access.ok) return access.response
  const { admin, participant, userId } = access
  const now = new Date()
  if (participant.viewer === 'coach') {
    const { data: coach, error } = await admin
      .from('coaches')
      .select('last_seen_at')
      .eq('id', participant.coachId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Presence is temporarily unavailable.' }, { status: 500 })
    const previous = coach?.last_seen_at ? new Date(coach.last_seen_at).getTime() : 0
    if (now.getTime() - previous > 60_000) {
      const { error: updateError } = await admin
        .from('coaches')
        .update({ last_seen_at: now.toISOString() })
        .eq('id', participant.coachId)
      if (updateError) return NextResponse.json({ error: 'Presence is temporarily unavailable.' }, { status: 500 })
    }
  } else {
    const { data: profile, error } = await admin
      .from('profiles')
      .select('last_seen_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Presence is temporarily unavailable.' }, { status: 500 })
    const previous = profile?.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0
    if (now.getTime() - previous > 60_000) {
      const { error: updateError } = await admin
        .from('profiles')
        .update({ last_seen_at: now.toISOString() })
        .eq('id', userId)
      if (updateError) return NextResponse.json({ error: 'Presence is temporarily unavailable.' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
