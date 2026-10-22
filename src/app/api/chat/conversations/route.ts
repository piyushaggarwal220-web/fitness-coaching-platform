import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { getOrCreateConversation } from '@/lib/coach-chat'
import { clientHasCoachChat, PIYUSH_NO_CHAT_MESSAGE } from '@/lib/coach-service'
import { createAdminClient } from '@/lib/supabase/admin'

async function blockedPiyushChat(userId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('coach_id').eq('id', userId).maybeSingle()
  if (!clientHasCoachChat(data)) {
    return NextResponse.json({ error: PIYUSH_NO_CHAT_MESSAGE }, { status: 403 })
  }
  return null
}

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const blocked = await blockedPiyushChat(auth.user.id)
  if (blocked) return blocked

  const { data, error, isNew } = await getOrCreateConversation(createAdminClient(), auth.user.id)
  if (error || !data) {
    return NextResponse.json(
      { error: error ?? 'Conversation could not be opened.' },
      { status: 503 }
    )
  }

  return NextResponse.json({ conversation: data, isNew })
}

export async function POST() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const blocked = await blockedPiyushChat(auth.user.id)
  if (blocked) return blocked

  const { data, error, isNew } = await getOrCreateConversation(createAdminClient(), auth.user.id)
  if (error || !data) {
    return NextResponse.json(
      { error: error ?? 'Conversation could not be opened.' },
      { status: 503 }
    )
  }

  return NextResponse.json({ conversation: data, isNew })
}
