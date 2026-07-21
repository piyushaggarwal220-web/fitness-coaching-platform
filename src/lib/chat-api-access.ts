import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  authorizeConversationParticipant,
  type ConversationParticipant,
} from '@/lib/chat-access'
import { createAdminClient } from '@/lib/supabase/admin'

export type ApiConversationAccess =
  | {
      ok: true
      userId: string
      admin: ReturnType<typeof createAdminClient>
      participant: ConversationParticipant
    }
  | { ok: false; response: NextResponse }

export async function requireConversationParticipant(
  conversationId: string
): Promise<ApiConversationAccess> {
  const auth = await requireApiUser()
  if (!auth.ok) return auth

  return requireConversationParticipantForUser(conversationId, auth.user.id)
}

export async function requireConversationParticipantForUser(
  conversationId: string,
  userId: string
): Promise<ApiConversationAccess> {
  const admin = createAdminClient()
  const access = await authorizeConversationParticipant(admin, conversationId, userId)
  if (access.status === 'allowed') {
    return {
      ok: true,
      userId,
      admin,
      participant: access.participant,
    }
  }

  if (access.status === 'error') {
    console.error('[chat-access] authorization lookup failed', {
      conversationId,
      error: access.error,
    })
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Chat access is temporarily unavailable. Please retry.' },
        { status: 500 }
      ),
    }
  }

  if (access.status === 'forbidden') {
    // Match the missing-conversation response so non-participants cannot probe
    // opaque conversation ids. Role-specific actions return 403 after access.
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Conversation not found.' },
        { status: 404 }
      ),
    }
  }

  return {
    ok: false,
    response: NextResponse.json(
      { success: false, error: 'Conversation not found.' },
      { status: 404 }
    ),
  }
}
