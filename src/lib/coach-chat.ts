import type { SupabaseClient } from '@supabase/supabase-js'
import { autoAssignCoachToClient } from '@/lib/coach-assignment'
import { sendNotification } from '@/lib/notifications/service'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CoachConversation,
  ConversationMessage,
  ConversationStatus,
  MessageSender,
  MessageType,
} from '@/types/database'

function messagePreview(
  messageType: MessageType,
  content?: string | null
): string {
  if (messageType === 'voice') return 'Voice message'
  if (messageType === 'image') return 'Photo'
  if (messageType === 'system') return content?.slice(0, 120) ?? 'System message'
  return content?.slice(0, 120) ?? 'Message'
}

async function insertSystemMessage(
  conversationId: string,
  content: string
): Promise<void> {
  const admin = createAdminClient()
  await admin.from('conversation_messages').insert({
    conversation_id: conversationId,
    sender_type: 'system' as MessageSender,
    message_type: 'system' as MessageType,
    content,
    created_at: new Date().toISOString(),
  })
}

async function syncConversationCoach(
  supabase: SupabaseClient,
  conversation: CoachConversation,
  clientId: string
): Promise<CoachConversation> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('coach_id')
    .eq('id', clientId)
    .maybeSingle()

  const assignedCoachId = profile?.coach_id
  if (!assignedCoachId || assignedCoachId === conversation.coach_id) {
    return conversation
  }

  const { data: updated, error } = await supabase
    .from('coach_conversations')
    .update({
      coach_id: assignedCoachId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
    .select()
    .single()

  if (error || !updated) return conversation

  await insertSystemMessage(
    conversation.id,
    'Your conversation has been transferred to your assigned coach.'
  )

  return updated as CoachConversation
}

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
    const synced = await syncConversationCoach(
      supabase,
      existing as CoachConversation,
      clientId
    )
    return { data: synced, error: null, isNew: false }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('coach_id')
    .eq('id', clientId)
    .maybeSingle()

  let coachId = profile?.coach_id ?? null

  if (!coachId) {
    const admin = createAdminClient()
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

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('coach_conversations')
        .select('*')
        .eq('client_id', clientId)
        .neq('status', 'closed')
        .maybeSingle()
      if (raced) {
        return { data: raced as CoachConversation, error: null, isNew: false }
      }
    }
    return { data: null, error: error.message ?? 'Failed to start conversation.', isNew: false }
  }

  if (!conversation) {
    return { data: null, error: 'Failed to start conversation.', isNew: false }
  }

  await insertSystemMessage(conversation.id, 'Connecting you with your coach...')

  const { data: coach } = await supabase
    .from('coaches')
    .select('user_id, name')
    .eq('id', coachId)
    .maybeSingle()

  const coachName = coach?.name ?? 'Your coach'

  await supabase
    .from('coach_conversations')
    .update({
      status: 'active',
      last_message_preview: `${coachName} has joined the conversation.`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  await insertSystemMessage(
    conversation.id,
    `${coachName} has joined the conversation.`
  )

  if (coach?.user_id) {
    await sendNotification({
      userId: coach.user_id,
      type: 'unread_chat',
      title: 'New conversation',
      body: 'A client has started a conversation with you.',
      actionUrl: `/coach/chat/${conversation.id}`,
    })
  }

  const updated = {
    ...conversation,
    status: 'active' as ConversationStatus,
    last_message_preview: `${coachName} has joined the conversation.`,
  }
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
  const preview = messagePreview(messageType, input.content)

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
        last_message_preview: preview,
        updated_at: now,
        status: 'active',
      })
      .eq('id', input.conversationId)

    if (input.senderType === 'coach') {
      await sendNotification({
        userId: conv.client_id,
        type: 'coach_replied',
        title: 'Your coach replied',
        body: messageType === 'voice' ? 'Sent a voice message' : (input.content?.slice(0, 100) ?? 'New message'),
        actionUrl: '/client/chat',
      })
    } else {
      const { data: coach } = await supabase
        .from('coaches')
        .select('user_id')
        .eq('id', conv.coach_id)
        .maybeSingle()

      if (coach?.user_id) {
        await sendNotification({
          userId: coach.user_id,
          type: 'unread_chat',
          title: 'New client message',
          body: preview,
          actionUrl: `/coach/chat/${input.conversationId}`,
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
  const d = new Date(date)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeActivity(date: string | null | undefined): string {
  if (!date) return 'No activity'
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
