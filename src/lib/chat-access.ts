import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoachConversation } from '@/types/database'

export type ConversationParticipant = {
  conversation: CoachConversation
  viewer: 'client' | 'coach'
  coachId: string
}

export type ConversationAccessResult =
  | { status: 'allowed'; participant: ConversationParticipant }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'error'; error: string }

/**
 * Authorize with trusted tables before any service-role read/write.
 * The caller must first establish the auth user from signed Supabase cookies.
 */
export async function authorizeConversationParticipant(
  admin: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<ConversationAccessResult> {
  const { data: conversation, error: conversationError } = await admin
    .from('coach_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()

  if (conversationError) return { status: 'error', error: conversationError.message }
  if (!conversation) return { status: 'not_found' }

  if (conversation.client_id === userId) {
    return {
      status: 'allowed',
      participant: {
        conversation: conversation as CoachConversation,
        viewer: 'client',
        coachId: conversation.coach_id,
      },
    }
  }

  const { data: coach, error: coachError } = await admin
    .from('coaches')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (coachError) return { status: 'error', error: coachError.message }
  if (coach?.id !== conversation.coach_id) return { status: 'forbidden' }

  return {
    status: 'allowed',
    participant: {
      conversation: conversation as CoachConversation,
      viewer: 'coach',
      coachId: conversation.coach_id,
    },
  }
}
