import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  requireConversationParticipant,
  requireConversationParticipantForUser,
} from '@/lib/chat-api-access'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CallRequestStatus } from '@/types/database'

const FINAL_STATUSES = new Set<CallRequestStatus>(['completed', 'declined', 'cancelled'])
const COACH_STATUSES = new Set<CallRequestStatus>([
  'requested',
  'scheduled',
  'completed',
  'declined',
  'cancelled',
])
const ALLOWED_TRANSITIONS: Record<CallRequestStatus, Set<CallRequestStatus>> = {
  requested: new Set(['scheduled', 'completed', 'declined', 'cancelled']),
  scheduled: new Set(['scheduled', 'completed', 'declined', 'cancelled']),
  completed: new Set(),
  declined: new Set(),
  cancelled: new Set(),
}

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get('conversationId')?.trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }

  const access = await requireConversationParticipant(conversationId)
  if (!access.ok) return access.response

  const { data, error } = await access.admin
    .from('call_requests')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('[call-requests] list failed', { conversationId, error: error.message })
    return NextResponse.json({ error: 'Call requests are temporarily unavailable. Please retry.' }, { status: 500 })
  }
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { conversationId?: string } | null
  const conversationId = body?.conversationId?.trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  }

  const access = await requireConversationParticipant(conversationId)
  if (!access.ok) return access.response
  if (access.participant.viewer !== 'client') {
    return NextResponse.json({ error: 'Only the client can request a call' }, { status: 403 })
  }

  const { admin, participant, userId } = access
  const { data: existing } = await admin
    .from('call_requests')
    .select('*')
    .eq('conversation_id', conversationId)
    .in('status', ['requested', 'scheduled'])
    .maybeSingle()
  if (existing) return NextResponse.json({ request: existing, deduplicated: true })

  const now = new Date().toISOString()
  const { data: created, error } = await admin
    .from('call_requests')
    .insert({
      conversation_id: conversationId,
      client_id: participant.conversation.client_id,
      coach_id: participant.conversation.coach_id,
      status: 'requested',
      updated_by: userId,
      requested_at: now,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await admin
        .from('call_requests')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', ['requested', 'scheduled'])
        .single()
      return NextResponse.json({ request: raced, deduplicated: true })
    }
    console.error('[call-requests] create failed', { conversationId, error: error.message })
    return NextResponse.json({ error: 'Call request could not be created. Please retry.' }, { status: 500 })
  }

  await admin.from('call_request_events').insert({
    call_request_id: created.id,
    from_status: null,
    to_status: 'requested',
    actor_user_id: userId,
  })

  const { data: coach } = await admin
    .from('coaches')
    .select('user_id')
    .eq('id', participant.conversation.coach_id)
    .single()
  if (coach?.user_id) {
    await sendNotification({
      userId: coach.user_id,
      type: 'call_requested',
      title: 'Client requested a call',
      body: 'A client requested a coaching call. Review it in your work queue.',
      actionUrl: `/coach/chat/${conversationId}`,
      metadata: { callRequestId: created.id, conversationId },
    })
  }

  return NextResponse.json({ request: created, deduplicated: false }, { status: 201 })
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as {
    requestId?: string
    status?: CallRequestStatus
    scheduledFor?: string | null
    note?: string | null
  } | null
  if (!body?.requestId || !body.status || !COACH_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Valid requestId and status required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('call_requests')
    .select('*')
    .eq('id', body.requestId)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'Call request not found' }, { status: 404 })

  const access = await requireConversationParticipantForUser(
    current.conversation_id,
    auth.user.id
  )
  if (!access.ok) return access.response

  const isCoach =
    access.participant.viewer === 'coach' &&
    access.participant.coachId === current.coach_id
  const isClientCancelling =
    access.userId === current.client_id &&
    body.status === 'cancelled' &&
    (current.status === 'requested' || current.status === 'scheduled')
  if (!isCoach && !isClientCancelling) {
    return NextResponse.json({ error: 'Not allowed to update this request' }, { status: 403 })
  }
  if (!ALLOWED_TRANSITIONS[current.status as CallRequestStatus].has(body.status)) {
    return NextResponse.json(
      { error: `Cannot change a ${current.status} call request to ${body.status}` },
      { status: 409 }
    )
  }
  if (body.status === 'scheduled' && !body.scheduledFor) {
    return NextResponse.json({ error: 'scheduledFor is required when scheduling' }, { status: 400 })
  }

  const scheduledDate = body.status === 'scheduled' ? new Date(body.scheduledFor!) : null
  if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: 'scheduledFor must be a valid date and time' }, { status: 400 })
  }
  if (scheduledDate && scheduledDate.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Scheduled call time must be in the future' }, { status: 400 })
  }
  const scheduledFor = scheduledDate?.toISOString() ?? current.scheduled_for
  const now = new Date().toISOString()
  const resolvedAt = FINAL_STATUSES.has(body.status) ? now : null
  const { data: updated, error } = await admin
    .from('call_requests')
    .update({
      status: body.status,
      scheduled_for: scheduledFor,
      coach_note: body.note?.trim().slice(0, 500) || current.coach_note,
      updated_by: access.userId,
      resolved_at: resolvedAt,
      updated_at: now,
    })
    .eq('id', current.id)
    .eq('updated_at', current.updated_at)
    .select()
    .maybeSingle()
  if (error) {
    console.error('[call-requests] update failed', { requestId: current.id, error: error.message })
    return NextResponse.json({ error: 'Call request could not be updated. Please retry.' }, { status: 500 })
  }
  if (!updated) return NextResponse.json({ error: 'Request changed; refresh and retry' }, { status: 409 })

  await admin.from('call_request_events').insert({
    call_request_id: current.id,
    from_status: current.status,
    to_status: body.status,
    actor_user_id: access.userId,
    scheduled_for: scheduledFor,
    note: body.note?.trim().slice(0, 500) || null,
  })

  if (isCoach) {
    const scheduleText = body.status === 'scheduled'
      ? ` for ${new Date(scheduledFor).toLocaleString('en-IN')}`
      : ''
    await sendNotification({
      userId: current.client_id,
      type: 'call_request_updated',
      title: 'Call request updated',
      body: `Your call request is now ${body.status}${scheduleText}.`,
      actionUrl: '/client/chat',
      metadata: { callRequestId: current.id, status: body.status },
    })
  }

  return NextResponse.json({ request: updated })
}
