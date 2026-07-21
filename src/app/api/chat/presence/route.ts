import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

async function context(conversationId: string) {
  const auth = await requireApiUser()
  if (!auth.ok) return { auth, conversation: null, coach: null }

  const { data: conversation } = await auth.supabase
    .from('coach_conversations')
    .select('id, client_id, coach_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conversation) return { auth, conversation: null, coach: null }

  const { data: coach } = await auth.supabase
    .from('coaches')
    .select('id, user_id, last_seen_at')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  return { auth, conversation, coach }
}

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get('conversationId')?.trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }

  const value = await context(conversationId)
  if (!value.auth.ok) return value.auth.response
  if (!value.conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  if (value.coach) {
    const { data: profile } = await admin
      .from('profiles')
      .select('last_seen_at')
      .eq('id', value.conversation.client_id)
      .single()
    return NextResponse.json({ viewer: 'coach', peerLastSeenAt: profile?.last_seen_at ?? null })
  }

  const { data: coach } = await admin
    .from('coaches')
    .select('last_seen_at')
    .eq('id', value.conversation.coach_id)
    .single()
  return NextResponse.json({ viewer: 'client', peerLastSeenAt: coach?.last_seen_at ?? null })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { conversationId?: string } | null
  const conversationId = body?.conversationId?.trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }

  const value = await context(conversationId)
  if (!value.auth.ok) return value.auth.response
  if (!value.conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const now = new Date()
  if (value.coach) {
    const previous = value.coach.last_seen_at ? new Date(value.coach.last_seen_at).getTime() : 0
    if (now.getTime() - previous > 60_000) {
      await admin.from('coaches').update({ last_seen_at: now.toISOString() }).eq('id', value.coach.id)
    }
  } else {
    const { data: profile } = await admin
      .from('profiles')
      .select('last_seen_at')
      .eq('id', value.auth.user.id)
      .single()
    const previous = profile?.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0
    if (now.getTime() - previous > 60_000) {
      await admin.from('profiles').update({ last_seen_at: now.toISOString() }).eq('id', value.auth.user.id)
    }
  }

  return NextResponse.json({ success: true })
}
