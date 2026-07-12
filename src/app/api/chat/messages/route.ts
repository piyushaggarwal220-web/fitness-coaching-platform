import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markConversationRead, sendChatMessage, setTypingIndicator } from '@/lib/coach-chat'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: coachRow } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  const reader = coachRow ? 'coach' : 'client'
  await markConversationRead(supabase, conversationId, reader)

  return NextResponse.json({ messages: data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { conversationId, content, messageType, mediaUrl, mediaDurationSeconds, typing } = body

  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  if (typing) {
    const { data: coachRow } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
    await setTypingIndicator(supabase, conversationId, coachRow ? 'coach' : 'client')
    return NextResponse.json({ ok: true })
  }

  const { data: coachRow } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  const senderType = coachRow ? 'coach' as const : 'client' as const
  const senderId = coachRow ? coachRow.id : user.id

  const { data, error } = await sendChatMessage(supabase, {
    conversationId,
    senderType,
    senderId,
    messageType: messageType ?? 'text',
    content,
    mediaUrl,
    mediaDurationSeconds,
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ message: data })
}
