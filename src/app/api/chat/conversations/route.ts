import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { getOrCreateConversation } from '@/lib/coach-chat'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

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

  const { data, error, isNew } = await getOrCreateConversation(createAdminClient(), auth.user.id)
  if (error || !data) {
    return NextResponse.json(
      { error: error ?? 'Conversation could not be opened.' },
      { status: 503 }
    )
  }

  return NextResponse.json({ conversation: data, isNew })
}
