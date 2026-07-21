import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { logApiDev } from '@/lib/api-dev-log'
import { markConversationRead, sendChatMessage, setTypingIndicator } from '@/lib/coach-chat'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser()
    if (!auth.ok) {
      logApiDev('chat_messages_get_auth_failed', { sessionFound: false })
      return auth.response
    }

    const { supabase, user } = auth
    const url = new URL(request.url)
    const conversationId = url.searchParams.get('conversationId')
    const peek = url.searchParams.get('peek') === '1'

    logApiDev('chat_messages_get', {
      userId: user.id,
      conversationId,
      peek,
    })

    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'conversationId required' }, { status: 400 })
    }

    const { data: accessibleConversation, error: accessError } = await supabase
      .from('coach_conversations')
      .select('id')
      .eq('id', conversationId)
      .maybeSingle()

    if (accessError || !accessibleConversation) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      logApiDev('chat_messages_get_query_failed', { conversationId, error: error.message })
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const { data: coachRow } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
    const reader = coachRow ? 'coach' : 'client'

    if (!peek) {
      // The message table intentionally has no broad client UPDATE policy:
      // mark read only after the conversation RLS check above proves access.
      await markConversationRead(createAdminClient(), conversationId, reader)
    }

    const { data: conv } = await supabase
      .from('coach_conversations')
      .select('client_typing_at, coach_typing_at')
      .eq('id', conversationId)
      .maybeSingle()

    const typingField = reader === 'client' ? 'coach_typing_at' : 'client_typing_at'
    const typingAt = conv?.[typingField as keyof typeof conv] as string | null
    const peerTyping = typingAt
      ? Date.now() - new Date(typingAt).getTime() < 5000
      : false

    return NextResponse.json({ success: true, messages: data, peerTyping })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load messages'
    logApiDev('chat_messages_get_exception', { error: message })
    console.error('[chat-messages] GET unhandled:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    logApiDev('chat_messages_post_started', {
      host: request.headers.get('host'),
      hasCookie: Boolean(request.headers.get('cookie')),
    })

    const auth = await requireApiUser()
    if (!auth.ok) {
      logApiDev('chat_messages_post_auth_failed', { sessionFound: false })
      return auth.response
    }

    const { supabase, user } = auth

    let body: {
      conversationId?: string
      content?: string
      messageType?: string
      mediaUrl?: string
      mediaDurationSeconds?: number
      typing?: boolean
    }

    try {
      body = (await request.json()) as typeof body
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const conversationId = body.conversationId?.trim()
    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'conversationId required' }, { status: 400 })
    }

    const { data: coachRow } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()

    if (body.typing) {
      await setTypingIndicator(supabase, conversationId, coachRow ? 'coach' : 'client')
      return NextResponse.json({ success: true })
    }

    const senderType = coachRow ? ('coach' as const) : ('client' as const)
    const senderId = coachRow ? coachRow.id : user.id

    logApiDev('chat_messages_post_send', {
      userId: user.id,
      coachId: coachRow?.id ?? null,
      conversationId,
      senderType,
    })

    const { data, error } = await sendChatMessage(supabase, {
      conversationId,
      senderType,
      senderId,
      messageType: (body.messageType as 'text' | 'voice' | 'image' | 'system' | undefined) ?? 'text',
      content: body.content,
      mediaUrl: body.mediaUrl,
      mediaDurationSeconds: body.mediaDurationSeconds,
    })

    if (error) {
      logApiDev('chat_messages_post_failed', { conversationId, error })
      return NextResponse.json({ success: false, error }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send message'
    logApiDev('chat_messages_post_exception', { error: message })
    console.error('[chat-messages] POST unhandled:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
