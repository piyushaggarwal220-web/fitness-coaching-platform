import { NextResponse } from 'next/server'
import { logApiDev } from '@/lib/api-dev-log'
import { markConversationRead, sendChatMessage, setTypingIndicator } from '@/lib/coach-chat'
import { requireConversationParticipant } from '@/lib/chat-api-access'
import { hasClientEntitlement } from '@/lib/entitlements'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const conversationId = url.searchParams.get('conversationId')
    const peek = url.searchParams.get('peek') === '1'
    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'conversationId required' }, { status: 400 })
    }

    const access = await requireConversationParticipant(conversationId)
    if (!access.ok) {
      logApiDev('chat_messages_get_auth_failed', { sessionFound: false })
      return access.response
    }

    logApiDev('chat_messages_get', {
      userId: access.userId,
      conversationId,
      peek,
    })

    const { admin, participant } = access
    const { data, error } = await admin
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      logApiDev('chat_messages_get_query_failed', { conversationId, error: error.message })
      return NextResponse.json(
        { success: false, error: 'Messages are temporarily unavailable. Please retry.' },
        { status: 500 }
      )
    }

    const reader = participant.viewer

    if (!peek) {
      const readThrough = data.at(-1)?.created_at ?? null
      await markConversationRead(admin, conversationId, reader, readThrough)
    }

    const typingField = reader === 'client' ? 'coach_typing_at' : 'client_typing_at'
    const typingAt = participant.conversation[
      typingField as keyof typeof participant.conversation
    ] as string | null
    const peerTyping = typingAt
      ? Date.now() - new Date(typingAt).getTime() < 5000
      : false

    const [{ data: callRequests, error: callRequestError }, peerResult] = await Promise.all([
      admin
        .from('call_requests')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(10),
      reader === 'client'
        ? admin
            .from('coaches')
            .select('last_seen_at')
            .eq('id', participant.conversation.coach_id)
            .maybeSingle()
        : admin
            .from('profiles')
            .select('last_seen_at')
            .eq('id', participant.conversation.client_id)
            .maybeSingle(),
    ])
    if (callRequestError || peerResult.error) {
      return NextResponse.json(
        { success: false, error: 'Chat metadata is temporarily unavailable. Please retry.' },
        { status: 500 }
      )
    }
    const peerLastSeenAt = peerResult.data?.last_seen_at ?? null

    return NextResponse.json({
      success: true,
      messages: data,
      peerTyping,
      callRequests: callRequests ?? [],
      peerLastSeenAt,
    })
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

    const access = await requireConversationParticipant(conversationId)
    if (!access.ok) {
      logApiDev('chat_messages_post_auth_failed', { sessionFound: false })
      return access.response
    }
    const { admin, participant, userId } = access

    if (participant.viewer === 'client') {
      const { data: profile } = await admin
        .from('profiles')
        .select('payment_confirmed, access_source, subscription_expires_at')
        .eq('id', userId)
        .maybeSingle()
      if (!hasClientEntitlement(profile)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Your coaching plan has ended. Renew to continue chatting.',
            code: 'entitlement_expired',
          },
          { status: 403 }
        )
      }
    }

    if (body.typing) {
      await setTypingIndicator(admin, conversationId, participant.viewer)
      return NextResponse.json({ success: true })
    }

    const senderType = participant.viewer
    const senderId = senderType === 'coach' ? participant.coachId : userId

    logApiDev('chat_messages_post_send', {
      userId,
      coachId: senderType === 'coach' ? participant.coachId : null,
      conversationId,
      senderType,
    })

    const { data, error } = await sendChatMessage(admin, {
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
      return NextResponse.json(
        { success: false, error: 'Message could not be sent right now. Please retry.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send message'
    logApiDev('chat_messages_post_exception', { error: message })
    console.error('[chat-messages] POST unhandled:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
