import type { SupabaseClient } from '@supabase/supabase-js'

const MEDICAL_ONLY =
  /\b(chest pain|suicid|kill myself|self.?harm|emergency|hospitalized|can'?t breathe|cannot breathe)\b/i

export function chatNeedsHumanCoach(input: {
  messageType?: string | null
  message_type?: string | null
  content?: string | null
}): boolean {
  const text = input.content?.trim() ?? ''
  return MEDICAL_ONLY.test(text)
}

/**
 * Coach chat does not answer the client. Summaries and plan updates stay on
 * the coach's screen.
 */
export async function autoReplyUnreadChat(
  _admin: SupabaseClient,
  _input: {
    conversationId: string
    clientId: string
    coachUserId: string
    coachId?: string | null
    coachFirstName?: string | null
    force?: boolean
  }
): Promise<{ status: 'sent' | 'skipped' | 'failed'; detail: string }> {
  return { status: 'skipped', detail: 'coach_chat_is_silent' }
}

/** @deprecated Use autoReplyUnreadChat. Coach chat stays silent. */
export async function autoReplyPiyushUnreadChat(
  admin: SupabaseClient,
  input: {
    conversationId: string
    clientId: string
    coachUserId: string
    coachId?: string | null
    coachFirstName?: string | null
  }
): Promise<{ status: 'sent' | 'skipped' | 'failed'; detail: string }> {
  return autoReplyUnreadChat(admin, input)
}
