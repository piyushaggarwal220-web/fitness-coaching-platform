import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { listCoachConversations } from '@/lib/coach-chat'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data: coach, error: coachError } = await admin
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError) {
    console.error('[coach-conversations] coach lookup failed', coachError.message)
    return NextResponse.json(
      { error: 'Coach conversations are temporarily unavailable. Please retry.' },
      { status: 500 }
    )
  }

  if (!coach?.id) {
    return NextResponse.json({ error: 'Coach access required.' }, { status: 403 })
  }

  const { data, error } = await listCoachConversations(coach.id)
  if (error) {
    console.error('[coach-conversations] list failed', error)
    return NextResponse.json(
      { error: 'Coach conversations are temporarily unavailable. Please retry.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    coachId: coach.id,
    conversations: data ?? [],
  })
}
