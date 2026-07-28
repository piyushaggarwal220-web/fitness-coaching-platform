import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { serializeCoachResponse } from '@/lib/checkin'
import { postCoachCheckinFeedbackToChat } from '@/lib/coach-chat'
import { getCheckinTypeDisplayName } from '@/lib/checkin-schedule'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CoachCheckinResponse } from '@/types/database'

type ReviewBody = {
  checkinId?: string
  feedback?: string
  action_items?: string
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  let body: ReviewBody
  try {
    body = (await request.json()) as ReviewBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const checkinId = body.checkinId?.trim()
  const feedback = body.feedback?.trim() ?? ''
  const actionItems = body.action_items?.trim() ?? ''

  if (!checkinId) {
    return NextResponse.json({ ok: false, error: 'Check-in ID is required.' }, { status: 400 })
  }
  if (!feedback) {
    return NextResponse.json({ ok: false, error: 'Feedback is required.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: coach, error: coachError } = await admin
    .from('coaches')
    .select('id, user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError || !coach) {
    return NextResponse.json({ ok: false, error: 'Coach access required.' }, { status: 403 })
  }

  const { data: checkin, error: checkinError } = await admin
    .from('checkins')
    .select('id, client_id, coach_id, checkin_type, coaching_week, reviewed')
    .eq('id', checkinId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (checkinError || !checkin) {
    return NextResponse.json({ ok: false, error: 'Check-in not found or not assigned to you.' }, { status: 404 })
  }

  const response: CoachCheckinResponse = { feedback, action_items: actionItems }
  const now = new Date().toISOString()

  const { error: updateError } = await admin
    .from('checkins')
    .update({
      coach_response: serializeCoachResponse(response),
      reviewed: true,
      reviewed_at: now,
    })
    .eq('id', checkin.id)

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: updateError.message ?? 'Failed to save review.' },
      { status: 500 }
    )
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ checkin_awaiting: false })
    .eq('id', checkin.client_id)

  if (profileError) {
    return NextResponse.json(
      { ok: false, error: 'Review saved but failed to update client status.' },
      { status: 500 }
    )
  }

  const checkinType = checkin.checkin_type === 'mid_week' ? 'mid_week' : 'weekly'

  const chatResult = await postCoachCheckinFeedbackToChat({
    clientId: checkin.client_id,
    coachId: coach.id,
    coachUserId: coach.user_id,
    checkinType,
    coachingWeek: checkin.coaching_week,
    feedback,
    actionItems,
  })

  if (chatResult.error) {
    console.error('[coach-checkin-review] chat post failed:', chatResult.error)
  }

  const typeLabel = getCheckinTypeDisplayName(checkinType)
  const snippet = feedback.slice(0, 100)

  await sendNotification({
    userId: checkin.client_id,
    type: 'coach_replied',
    title: `${typeLabel} feedback`,
    body: snippet || 'Your coach has reviewed your check-in.',
    actionUrl: chatResult.conversationId ? '/client/chat' : '/journey',
    metadata: {
      checkinId: checkin.id,
      conversationId: chatResult.conversationId,
      messageSnippet: snippet,
    },
    idempotencyKey: `checkin-review:${checkin.id}`,
  })

  return NextResponse.json({
    ok: true,
    reviewedAt: now,
    conversationId: chatResult.conversationId,
    chatError: chatResult.error,
  })
}
