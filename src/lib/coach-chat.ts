import type { SupabaseClient } from '@supabase/supabase-js'
import { autoAssignCoachToClient } from '@/lib/coach-assignment'
import { sendNotification } from '@/lib/notifications/service'
import type {
  CoachConversation,
  ConversationMessage,
  ConversationStatus,
  MessageSender,
  MessageType,
} from '@/types/database'

export async function getOrCreateConversation(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ data: CoachConversation | null; error: string | null; isNew: boolean }> {
  const { data: existing } = await supabase
    .from('coach_conversations')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'closed')
    .maybeSingle()

  if (existing) {
    return { data: existing as CoachConversation, error: null, isNew: false }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('coach_id')
    .eq('id', clientId)
    .maybeSingle()

  let coachId = profile?.coach_id ?? null

  if (!coachId) {
    const admin = await import('@/lib/supabase/admin').then((m) => m.createAdminClient())
    const assigned = await autoAssignCoachToClient(clientId, admin)
    if (assigned.error || !assigned.coachId) {
      return { data: null, error: assigned.error ?? 'No coach available.', isNew: false }
    }
    coachId = assigned.coachId
  }

  const now = new Date().toISOString()

  const { data: conversation, error } = await supabase
    .from('coach_conversations')
    .insert({
      client_id: clientId,
      coach_id: coachId,
      status: 'connecting' as ConversationStatus,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error || !conversation) {
    return { data: null, error: error?.message ?? 'Failed to start conversation.', isNew: false }
  }

  await supabase.from('conversation_messages').insert({
    conversation_id: conversation.id,
    sender_type: 'system' as MessageSender,
    message_type: 'system' as MessageType,
    content: 'Connecting you with your coach...',
    created_at: now,
  })

  const { data: coach } = await supabase
    .from('coaches')
    .select('user_id, name')
    .eq('id', coachId)
    .maybeSingle()

  const coachName = coach?.name ?? 'Your coach'

  await supabase
    .from('coach_conversations')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', conversation.id)

  await supabase.from('conversation_messages').insert({
    conversation_id: conversation.id,
    sender_type: 'system',
    message_type: 'system',
    content: `${coachName} has joined the conversation.`,
    created_at: new Date().toISOString(),
  })

  if (coach?.user_id) {
    await sendNotification({
      userId: coach.user_id,
      type: 'unread_chat',
      title: 'New conversation',
      body: 'A client has started a conversation with you.',
      actionUrl: `/coach/chat/${conversation.id}`,
    })
  }

  const updated = { ...conversation, status: 'active' as ConversationStatus }
  return { data: updated as CoachConversation, error: null, isNew: true }
}

export async function sendChatMessage(
  supabase: SupabaseClient,
  input: {
    conversationId: string
    senderType: 'client' | 'coach'
    senderId: string
    messageType?: MessageType
    content?: string
    mediaUrl?: string
    mediaDurationSeconds?: number
  }
): Promise<{ data: ConversationMessage | null; error: string | null }> {
  const now = new Date().toISOString()
  const messageType = input.messageType ?? 'text'

  const { data, error } = await supabase
    .from('conversation_messages')
    .insert({
      conversation_id: input.conversationId,
      sender_type: input.senderType,
      sender_id: input.senderId,
      message_type: messageType,
      content: input.content ?? null,
      media_url: input.mediaUrl ?? null,
      media_duration_seconds: input.mediaDurationSeconds ?? null,
      created_at: now,
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to send message.' }

  const unreadField = input.senderType === 'client' ? 'unread_by_coach' : 'unread_by_client'

  const { data: conv } = await supabase
    .from('coach_conversations')
    .select('client_id, coach_id, unread_by_client, unread_by_coach')
    .eq('id', input.conversationId)
    .single()

  if (conv) {
    const currentUnread = conv[unreadField as keyof typeof conv] as number
    await supabase
      .from('coach_conversations')
      .update({
        [unreadField]: (currentUnread ?? 0) + 1,
        last_message_at: now,
        updated_at: now,
        status: 'active',
      })
      .eq('id', input.conversationId)

    if (input.senderType === 'coach') {
      const { data: clientProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', conv.client_id)
        .maybeSingle()

      if (clientProfile) {
        await sendNotification({
          userId: conv.client_id,
          type: 'coach_replied',
          title: 'Your coach replied',
          body: messageType === 'voice' ? 'Sent a voice message' : (input.content?.slice(0, 100) ?? 'New message'),
          actionUrl: `/client/chat`,
        })
      }
    }
  }

  return { data: data as ConversationMessage, error: null }
}

export async function markConversationRead(
  supabase: SupabaseClient,
  conversationId: string,
  reader: 'client' | 'coach'
): Promise<void> {
  const now = new Date().toISOString()
  const unreadField = reader === 'client' ? 'unread_by_client' : 'unread_by_coach'

  await supabase
    .from('coach_conversations')
    .update({ [unreadField]: 0, updated_at: now })
    .eq('id', conversationId)

  const senderType = reader === 'client' ? 'coach' : 'client'
  await supabase
    .from('conversation_messages')
    .update({ read_at: now })
    .eq('conversation_id', conversationId)
    .eq('sender_type', senderType)
    .is('read_at', null)
}

export async function setTypingIndicator(
  supabase: SupabaseClient,
  conversationId: string,
  typer: 'client' | 'coach'
): Promise<void> {
  const field = typer === 'client' ? 'client_typing_at' : 'coach_typing_at'
  await supabase
    .from('coach_conversations')
    .update({ [field]: new Date().toISOString() })
    .eq('id', conversationId)
}

export function formatConversationStatus(status: ConversationStatus): string {
  if (status === 'connecting') return 'Connecting...'
  if (status === 'active') return 'Active'
  return 'Closed'
}

export function formatMessageTime(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
