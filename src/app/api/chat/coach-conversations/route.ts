import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  ensureCheckinInCoachChat,
  getOrCreateConversationForCoach,
  listCoachConversations,
} from '@/lib/coach-chat'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireCoachId() {
  const auth = await requireApiUser()
  if (!auth.ok) return { ok: false as const, response: auth.response }

  const admin = createAdminClient()
  const { data: coach, error: coachError } = await admin
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError) {
    console.error('[coach-conversations] coach lookup failed', coachError.message)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Coach conversations are temporarily unavailable. Please retry.' },
        { status: 500 }
      ),
    }
  }

  if (!coach?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Coach access required.' }, { status: 403 }),
    }
  }

  return { ok: true as const, admin, coachId: coach.id as string }
}

export async function GET() {
  const gate = await requireCoachId()
  if (!gate.ok) return gate.response

  const { data, error } = await listCoachConversations(gate.coachId)
  if (error) {
    console.error('[coach-conversations] list failed', error)
    return NextResponse.json(
      { error: 'Coach conversations are temporarily unavailable. Please retry.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    coachId: gate.coachId,
    conversations: data ?? [],
  })
}

/** Coach starts (or reopens) a chat with an assigned client. */
export async function POST(request: Request) {
  const gate = await requireCoachId()
  if (!gate.ok) return gate.response

  const body = (await request.json().catch(() => null)) as {
    clientId?: string
    checkinId?: string
  } | null
  const clientId = body?.clientId?.trim()
  let checkinId = body?.checkinId?.trim() || ''
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required.' }, { status: 400 })
  }

  // If the coach opened chat from a check-in queue item without an id, attach
  // the latest unreplied mid-week check-in so answers still appear in chat.
  if (!checkinId) {
    const { data: pendingMidweek } = await gate.admin
      .from('checkins')
      .select('id')
      .eq('client_id', clientId)
      .eq('coach_id', gate.coachId)
      .eq('checkin_type', 'mid_week')
      .eq('reviewed', false)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    checkinId = pendingMidweek?.id ?? ''
  }

  if (checkinId) {
    const ensured = await ensureCheckinInCoachChat({
      checkinId,
      coachId: gate.coachId,
      notifyCoach: false,
    })
    if (ensured.error) {
      console.error('[coach-conversations] ensure check-in chat failed', ensured.error)
      // Still open the conversation; the chat page can show the check-in panel.
    }
    if (ensured.conversationId) {
      const { data: conversation } = await gate.admin
        .from('coach_conversations')
        .select('*')
        .eq('id', ensured.conversationId)
        .maybeSingle()
      if (conversation) {
        return NextResponse.json({
          conversation,
          isNew: false,
          checkinPosted: ensured.posted,
          checkinId,
        })
      }
    }
  }

  const result = await getOrCreateConversationForCoach(gate.admin, gate.coachId, clientId)
  if (result.error || !result.data) {
    const status = result.error?.includes('not assigned') ? 403 : 400
    return NextResponse.json({ error: result.error ?? 'Could not open chat.' }, { status })
  }

  return NextResponse.json({
    conversation: result.data,
    isNew: result.isNew,
    checkinPosted: false,
    checkinId: checkinId || null,
  })
}
