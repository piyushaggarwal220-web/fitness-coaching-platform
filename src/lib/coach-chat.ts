import type { SupabaseClient } from '@supabase/supabase-js'
import { autoAssignCoachToClient } from '@/lib/coach-assignment'
import { serializeCoachResponse } from '@/lib/checkin'
import {
  formatCheckinChatMessageFromRow,
  isCheckinSystemMessage,
} from '@/lib/checkin-chat'
import {
  formatNextCoachWorkingHours,
  getCoachWorkingHoursStatus,
} from '@/lib/coach-working-hours'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Checkin,
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
  content: string,
  options?: { incrementCoachUnread?: boolean; sourceCheckinId?: string }
): Promise<{ error: string | null }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: conversation } = options?.incrementCoachUnread || options?.sourceCheckinId
    ? await admin
        .from('coach_conversations')
        .select('client_id')
        .eq('id', conversationId)
        .single()
    : { data: null }

  // Check-in summaries are stored as normal client text so they appear as
  // readable incoming bubbles in coach chat (not easy-to-miss system chips).
  const isCheckinSummary = Boolean(options?.sourceCheckinId)
  const { error } = await admin.from('conversation_messages').insert({
    conversation_id: conversationId,
    sender_type: (options?.incrementCoachUnread || isCheckinSummary
      ? 'client'
      : 'system') as MessageSender,
    sender_id:
      options?.incrementCoachUnread || isCheckinSummary
        ? conversation?.client_id ?? null
        : null,
    message_type: (isCheckinSummary ? 'text' : 'system') as MessageType,
    content,
    source_checkin_id: options?.sourceCheckinId ?? null,
    created_at: now,
  })

  // Idempotent re-post of the same check-in summary is a no-op success.
  if (error?.code === '23505' && options?.sourceCheckinId) {
    return { error: null }
  }
  return { error: error?.message ?? null }
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

export type CoachConversationListItem = CoachConversation & {
  profiles: { name: string | null; email: string | null } | null
}

/** Service-role list of open conversations for a coach (used by coach portal APIs). */
export async function listCoachConversations(
  coachId: string
): Promise<{ data: CoachConversationListItem[] | null; error: string | null }> {
  const admin = createAdminClient()
  const { data: conversations, error } = await admin
    .from('coach_conversations')
    .select('*')
    .eq('coach_id', coachId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (error) {
    return { data: null, error: error.message }
  }

  const rows = (conversations ?? []) as CoachConversation[]
  if (rows.length === 0) {
    return { data: [], error: null }
  }

  const clientIds = [...new Set(rows.map((row) => row.client_id))]
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, name, email')
    .in('id', clientIds)

  if (profileError) {
    return { data: null, error: profileError.message }
  }

  const profileById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id as string,
      {
        name: (profile.name as string | null) ?? null,
        email: (profile.email as string | null) ?? null,
      },
    ])
  )

  return {
    data: rows.map((row) => ({
      ...row,
      profiles: profileById.get(row.client_id) ?? null,
    })),
    error: null,
  }
}

export async function getOrCreateConversation(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ data: CoachConversation | null; error: string | null; isNew: boolean }> {
  const { data: existing, error: existingError } = await supabase
    .from('coach_conversations')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'closed')
    .maybeSingle()

  if (existingError) {
    return { data: null, error: existingError.message, isNew: false }
  }

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

/**
 * Coach-initiated get-or-create: only for clients assigned to this coach.
 * Does not auto-assign a different coach.
 */
export async function getOrCreateConversationForCoach(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<{ data: CoachConversation | null; error: string | null; isNew: boolean }> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, coach_id')
    .eq('id', clientId)
    .maybeSingle()

  if (profileError) {
    return { data: null, error: profileError.message, isNew: false }
  }
  if (!profile) {
    return { data: null, error: 'Client not found.', isNew: false }
  }
  if (profile.coach_id !== coachId) {
    return { data: null, error: 'Client is not assigned to you.', isNew: false }
  }

  const { data: existing, error: existingError } = await supabase
    .from('coach_conversations')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'closed')
    .maybeSingle()

  if (existingError) {
    return { data: null, error: existingError.message, isNew: false }
  }

  if (existing) {
    const synced = await syncConversationCoach(
      supabase,
      existing as CoachConversation,
      clientId
    )
    if (synced.coach_id !== coachId) {
      return { data: null, error: 'Conversation belongs to another coach.', isNew: false }
    }
    return { data: synced, error: null, isNew: false }
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

  const { data: coach } = await supabase
    .from('coaches')
    .select('name')
    .eq('id', coachId)
    .maybeSingle()

  const coachName = coach?.name ?? 'Your coach'

  await supabase
    .from('coach_conversations')
    .update({
      status: 'active',
      last_message_preview: `${coachName} started this conversation.`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  await insertSystemMessage(
    conversation.id,
    `${coachName} started this conversation.`
  )

  const updated = {
    ...conversation,
    status: 'active' as ConversationStatus,
    last_message_preview: `${coachName} started this conversation.`,
  }
  return { data: updated as CoachConversation, error: null, isNew: true }
}

function coachReplyFeedback(input: {
  messageType: MessageType
  content?: string
}): string {
  const content = input.content?.trim()
  if (input.messageType === 'text' && content) return content
  if (input.messageType === 'voice') return 'Coach replied with a voice message in chat.'
  if (input.messageType === 'image') return 'Coach replied with a photo in chat.'
  return content || 'Coach replied in chat.'
}

/**
 * When a coach replies in a thread that has an unreplied mid-week check-in summary,
 * mark that check-in reviewed. Voice/text/photo replies all count.
 */
async function completeMidWeekCheckinFromCoachReply(
  supabase: SupabaseClient,
  input: {
    conversationId: string
    replyCreatedAt: string
    messageType: MessageType
    content?: string
  }
): Promise<void> {
  const { data: summary, error: summaryError } = await supabase
    .from('conversation_messages')
    .select('source_checkin_id')
    .eq('conversation_id', input.conversationId)
    .not('source_checkin_id', 'is', null)
    .lte('created_at', input.replyCreatedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (summaryError || !summary?.source_checkin_id) return

  const { data: checkin, error: checkinError } = await supabase
    .from('checkins')
    .select('id, client_id, checkin_type, reviewed')
    .eq('id', summary.source_checkin_id)
    .maybeSingle()

  if (checkinError || !checkin || checkin.checkin_type !== 'mid_week' || checkin.reviewed) {
    return
  }

  const reviewedAt = input.replyCreatedAt
  const { error: updateError } = await supabase
    .from('checkins')
    .update({
      reviewed: true,
      reviewed_at: reviewedAt,
      coach_response: serializeCoachResponse({
        feedback: coachReplyFeedback(input),
        action_items: '',
      }),
    })
    .eq('id', checkin.id)
    .eq('reviewed', false)

  if (updateError) {
    console.error('[coach-chat] mid-week check-in completion failed:', updateError.message)
    return
  }

  const { count } = await supabase
    .from('checkins')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', checkin.client_id)
    .eq('reviewed', false)

  if ((count ?? 0) === 0) {
    await supabase
      .from('profiles')
      .update({ checkin_awaiting: false })
      .eq('id', checkin.client_id)
  }
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

  const preview = messagePreview(messageType, input.content)

  const { data: conv } = await supabase
    .from('coach_conversations')
    .select('client_id, coach_id, unread_by_client, unread_by_coach')
    .eq('id', input.conversationId)
    .single()

  if (conv) {
    if (input.senderType === 'coach') {
      try {
        await completeMidWeekCheckinFromCoachReply(supabase, {
          conversationId: input.conversationId,
          replyCreatedAt: data.created_at,
          messageType,
          content: input.content,
        })
      } catch (err) {
        // The reply is already persisted; completion can be retried from the check-in.
        console.error('[coach-chat] mid-week completion failed after reply:', err)
      }
    }

    try {
      if (input.senderType === 'coach') {
        const replyBody =
          messageType === 'voice' ? 'Sent a voice message' : (input.content?.slice(0, 100) ?? 'New message')
        await sendNotification({
          userId: conv.client_id,
          type: 'coach_replied',
          title: 'Your coach replied',
          body: replyBody,
          actionUrl: '/client/chat',
          metadata: { messageSnippet: replyBody, messageId: data.id, conversationId: input.conversationId },
          idempotencyKey: `chat-message:${data.id}:client`,
        })
      } else {
        const workingHours = getCoachWorkingHoursStatus(new Date(now))
        if (!workingHours.isOpen) {
          const nextWorkingHours = formatNextCoachWorkingHours(new Date(now))
          await sendNotification({
            userId: conv.client_id,
            type: 'unread_chat',
            title: 'Coach working hours',
            body: `Coaches are available from 9:00 AM to 6:00 PM. Please wait until ${nextWorkingHours}; your 2-hour response countdown will start or resume then.`,
            actionUrl: '/client/chat',
            metadata: {
              conversationId: input.conversationId,
              nextWorkingHoursAt: workingHours.nextOpensAt.toISOString(),
            },
            idempotencyKey: `coach-off-hours:${conv.client_id}:${input.conversationId}:${workingHours.nextOpensAt.toISOString()}`,
          })
        }

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
            metadata: { messageId: data.id, conversationId: input.conversationId },
            idempotencyKey: `chat-message:${data.id}:coach`,
          })
        }
      }
    } catch (err) {
      // Message is already persisted; don't fail send if notifications can't run.
      console.error('[coach-chat] notification failed after send:', err)
    }
  }

  return { data: data as ConversationMessage, error: null }
}

export async function markConversationRead(
  supabase: SupabaseClient,
  conversationId: string,
  reader: 'client' | 'coach',
  readThrough: string | null
): Promise<{ error: { message: string } | null }> {
  if (!readThrough) return { error: null }
  const now = new Date().toISOString()
  const senderType = reader === 'client' ? 'coach' : 'client'
  const { error } = await supabase
    .from('conversation_messages')
    .update({ read_at: now })
    .eq('conversation_id', conversationId)
    .eq('sender_type', senderType)
    .lte('created_at', readThrough)
    .is('read_at', null)

  return { error: error ? { message: error.message } : null }
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

export { formatMessageTime, formatRelativeActivity } from '@/lib/coach-chat-ui'

/**
 * Post a check-in summary into the client's persistent coach conversation.
 * Uses admin client — safe for API routes after check-in submit.
 */
export async function postCheckinToCoachChat(input: {
  clientId: string
  coachId: string
  message: string
  checkinId: string
  checkinType: 'mid_week' | 'weekly'
  notifyCoach?: boolean
}): Promise<{ conversationId: string | null; error: string | null }> {
  try {
    const admin = createAdminClient()
    const { data: conversation, error: convError } = await getOrCreateConversation(
      admin,
      input.clientId
    )

    if (convError || !conversation) {
      return { conversationId: null, error: convError ?? 'Could not open conversation' }
    }

    if (conversation.coach_id !== input.coachId) {
      await admin
        .from('coach_conversations')
        .update({ coach_id: input.coachId, updated_at: new Date().toISOString() })
        .eq('id', conversation.id)
    }

    const inserted = await insertSystemMessage(conversation.id, input.message, {
      incrementCoachUnread: true,
      sourceCheckinId: input.checkinId,
    })
    if (inserted.error) {
      return { conversationId: conversation.id, error: inserted.error }
    }

    if (input.notifyCoach !== false) {
      const { data: coach } = await admin
        .from('coaches')
        .select('user_id')
        .eq('id', input.coachId)
        .maybeSingle()

      if (coach?.user_id) {
        const label = input.checkinType === 'mid_week' ? 'Mid-week check-in' : 'Weekly check-in'
        await sendNotification({
          userId: coach.user_id,
          type: 'unread_chat',
          title: `${label} in chat`,
          body: input.message.split('\n').slice(0, 3).join(' · '),
          actionUrl: `/coach/chat?clientId=${input.clientId}&checkinId=${input.checkinId}`,
          metadata: { checkinId: input.checkinId, clientId: input.clientId },
          idempotencyKey: `checkin-chat:${input.checkinId}:coach`,
        })
      }
    }

    return { conversationId: conversation.id, error: null }
  } catch (err) {
    console.error('[checkin-chat]', err)
    return {
      conversationId: null,
      error: err instanceof Error ? err.message : 'Failed to post check-in to chat',
    }
  }
}

/**
 * Make sure a check-in's answers are visible in the client chat thread.
 * Used when a coach opens midweek check-in → chat (repairs missed/failed posts).
 */
export async function ensureCheckinInCoachChat(input: {
  checkinId: string
  coachId: string
  notifyCoach?: boolean
}): Promise<{ conversationId: string | null; posted: boolean; error: string | null }> {
  try {
    const admin = createAdminClient()
    const { data: checkin, error: checkinError } = await admin
      .from('checkins')
      .select('*')
      .eq('id', input.checkinId)
      .maybeSingle()

    if (checkinError || !checkin) {
      return {
        conversationId: null,
        posted: false,
        error: checkinError?.message ?? 'Check-in not found',
      }
    }

    const row = checkin as Checkin
    if (row.coach_id && row.coach_id !== input.coachId) {
      return { conversationId: null, posted: false, error: 'Check-in is not assigned to you.' }
    }

    const { data: existing } = await admin
      .from('conversation_messages')
      .select('id, conversation_id')
      .eq('source_checkin_id', input.checkinId)
      .maybeSingle()

    if (existing?.conversation_id) {
      return { conversationId: existing.conversation_id, posted: false, error: null }
    }

    const message = formatCheckinChatMessageFromRow(row)
    if (!message) {
      return {
        conversationId: null,
        posted: false,
        error: 'Check-in is missing fields needed for the chat summary.',
      }
    }

    const posted = await postCheckinToCoachChat({
      clientId: row.client_id,
      coachId: input.coachId,
      message,
      checkinId: row.id,
      checkinType: row.checkin_type,
      notifyCoach: input.notifyCoach ?? false,
    })

    return {
      conversationId: posted.conversationId,
      posted: !posted.error,
      error: posted.error,
    }
  } catch (err) {
    console.error('[checkin-chat] ensure failed:', err)
    return {
      conversationId: null,
      posted: false,
      error: err instanceof Error ? err.message : 'Failed to ensure check-in in chat',
    }
  }
}

export { isCheckinSystemMessage }

function formatCoachCheckinFeedbackMessage(input: {
  checkinType: 'mid_week' | 'weekly'
  coachingWeek: number | null
  feedback: string
  actionItems?: string | null
}): string {
  const label = input.checkinType === 'mid_week' ? 'Mid-week check-in' : 'Weekly check-in'
  const weekSuffix = input.coachingWeek != null ? ` · Week ${input.coachingWeek}` : ''
  const lines = [`${label} feedback${weekSuffix}`, '', input.feedback.trim()]
  if (input.actionItems?.trim()) {
    lines.push('', 'Action items', input.actionItems.trim())
  }
  return lines.join('\n')
}

/**
 * Post the coach's check-in review feedback as a coach text message in chat.
 * Uses admin client — safe for API routes after check-in review.
 */
export async function postCoachCheckinFeedbackToChat(input: {
  clientId: string
  coachId: string
  coachUserId: string
  checkinType: 'mid_week' | 'weekly'
  coachingWeek: number | null
  feedback: string
  actionItems?: string | null
}): Promise<{ conversationId: string | null; error: string | null }> {
  try {
    const admin = createAdminClient()
    const { data: conversation, error: convError } = await getOrCreateConversation(
      admin,
      input.clientId
    )

    if (convError || !conversation) {
      return { conversationId: null, error: convError ?? 'Could not open conversation' }
    }

    if (conversation.coach_id !== input.coachId) {
      await admin
        .from('coach_conversations')
        .update({ coach_id: input.coachId, updated_at: new Date().toISOString() })
        .eq('id', conversation.id)
    }

    const content = formatCoachCheckinFeedbackMessage({
      checkinType: input.checkinType,
      coachingWeek: input.coachingWeek,
      feedback: input.feedback,
      actionItems: input.actionItems,
    })

    const { error: sendError } = await sendChatMessage(admin, {
      conversationId: conversation.id,
      senderType: 'coach',
      senderId: input.coachUserId,
      content,
    })

    if (sendError) {
      return { conversationId: conversation.id, error: sendError }
    }

    return { conversationId: conversation.id, error: null }
  } catch (err) {
    console.error('[coach-chat] check-in feedback post failed:', err)
    return {
      conversationId: null,
      error: err instanceof Error ? err.message : 'Failed to post check-in feedback to chat',
    }
  }
}
