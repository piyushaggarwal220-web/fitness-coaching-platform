import { NextResponse, after } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { generateAndPostMidWeekAiSuggestion } from '@/lib/ai/mid-week-analysis'
import { formatCheckinChatMessageFromRow } from '@/lib/checkin-chat'
import { ensureCheckinInCoachChat } from '@/lib/coach-chat'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin } from '@/types/database'

/** Load a check-in for coach reply UI and ensure its answers exist in chat. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { id: checkinId } = await context.params
  if (!checkinId?.trim()) {
    return NextResponse.json({ error: 'checkinId is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: coach, error: coachError } = await admin
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError) {
    return NextResponse.json(
      { error: 'Check-in chat context is temporarily unavailable.' },
      { status: 500 }
    )
  }
  if (!coach?.id) {
    return NextResponse.json({ error: 'Coach access required.' }, { status: 403 })
  }

  const { data: checkin, error: checkinError } = await admin
    .from('checkins')
    .select('*')
    .eq('id', checkinId)
    .maybeSingle()

  if (checkinError || !checkin) {
    return NextResponse.json(
      { error: checkinError?.message ?? 'Check-in not found.' },
      { status: 404 }
    )
  }

  const row = checkin as Checkin
  if (row.coach_id && row.coach_id !== coach.id) {
    return NextResponse.json({ error: 'Check-in is not assigned to you.' }, { status: 403 })
  }

  const summary = formatCheckinChatMessageFromRow(row)
  if (!summary) {
    return NextResponse.json(
      { error: 'Check-in is missing fields needed for the chat summary.' },
      { status: 422 }
    )
  }

  const ensured = await ensureCheckinInCoachChat({
    checkinId: row.id,
    coachId: coach.id,
    notifyCoach: false,
  })

  if (ensured.error) {
    console.error('[checkin-for-chat] ensure failed:', ensured.error)
  }

  if (row.checkin_type === 'mid_week' && row.client_id) {
    after(() =>
      generateAndPostMidWeekAiSuggestion({
        clientId: row.client_id,
        coachId: coach.id,
        checkinId: row.id,
        conversationId: ensured.conversationId,
      }).catch((err) => console.error('[checkin-for-chat] mid-week AI failed:', err))
    )
  }

  return NextResponse.json({
    checkin: {
      id: row.id,
      client_id: row.client_id,
      checkin_type: row.checkin_type,
      coaching_week: row.coaching_week,
      submitted_at: row.submitted_at,
      reviewed: row.reviewed,
    },
    summary,
    conversationId: ensured.conversationId,
    checkinPosted: ensured.posted,
    ensureError: ensured.error,
  })
}
