import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { loadClientCallBookingPolicy, enforceClientCallPolicy } from '@/lib/call-booking-policy-server'
import { loadClientCoachQueueView } from '@/lib/client-coach-queue-server'
import { getOrCreateConversation } from '@/lib/coach-chat'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { isPublicDemoEmail } from '@/lib/public-demo'
import { publicDemoReadOnlyJson } from '@/lib/public-demo-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const [policy, queue] = await Promise.all([
    loadClientCallBookingPolicy(admin, auth.user.id),
    loadClientCoachQueueView(admin, auth.user.id),
  ])

  const { data: request } = await admin
    .from('call_requests')
    .select('id, status, source, requested_at, conversation_id')
    .eq('client_id', auth.user.id)
    .in('status', ['requested', 'scheduled'])
    .maybeSingle()

  return NextResponse.json({ success: true, policy, request: request ?? null, queue })
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  if (isPublicDemoEmail(auth.user.email)) return publicDemoReadOnlyJson()

  const body = (await request.json().catch(() => null)) as
    | { action?: 'start' | 'cancel'; requestId?: string }
    | null
  const action = body?.action === 'cancel' ? 'cancel' : 'start'

  const admin = createAdminClient()
  await enforceClientCallPolicy(admin, auth.user.id)
  const policy = await loadClientCallBookingPolicy(admin, auth.user.id)

  if (action === 'cancel') {
    const requestId = body?.requestId?.trim()
    if (!requestId) {
      return NextResponse.json({ error: 'requestId required' }, { status: 400 })
    }
    const now = new Date().toISOString()
    const { data: updated, error } = await admin
      .from('call_requests')
      .update({
        status: 'cancelled',
        resolved_at: now,
        updated_at: now,
        updated_by: auth.user.id,
      })
      .eq('id', requestId)
      .eq('client_id', auth.user.id)
      .in('status', ['requested', 'scheduled'])
      .select('id, status')
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: 'Could not cancel this call request.' }, { status: 500 })
    }
    if (!updated) {
      return NextResponse.json({ error: 'Call request not found.' }, { status: 404 })
    }
    return NextResponse.json({ success: true, request: updated })
  }

  if (!policy.canRequestManualCall) {
    return NextResponse.json(
      { error: policy.message ?? 'Weekly call booking is not available on your plan.' },
      { status: 403 }
    )
  }

  const conversation = await getOrCreateConversation(admin, auth.user.id)
  if (conversation.error || !conversation.data) {
    return NextResponse.json(
      { error: conversation.error ?? 'Could not open coach chat for this call.' },
      { status: 500 }
    )
  }

  const { data: existing } = await admin
    .from('call_requests')
    .select('*')
    .eq('client_id', auth.user.id)
    .in('status', ['requested', 'scheduled'])
    .maybeSingle()
  if (existing) return NextResponse.json({ success: true, request: existing, deduplicated: true })

  const now = new Date().toISOString()
  const { data: created, error } = await admin
    .from('call_requests')
    .insert({
      conversation_id: conversation.data.id,
      client_id: auth.user.id,
      coach_id: conversation.data.coach_id,
      status: 'requested',
      source: 'client_requested',
      updated_by: auth.user.id,
      requested_at: now,
      created_at: now,
      updated_at: now,
      coach_note: 'Client booked a weekly call from Home',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await admin
        .from('call_requests')
        .select('*')
        .eq('client_id', auth.user.id)
        .in('status', ['requested', 'scheduled'])
        .maybeSingle()
      return NextResponse.json({ success: true, request: raced, deduplicated: true })
    }
    console.error('[client/weekly-call] create failed', error.message)
    return NextResponse.json({ error: 'Call request could not be created. Please retry.' }, { status: 500 })
  }

  await admin.from('call_request_events').insert({
    call_request_id: created.id,
    from_status: null,
    to_status: 'requested',
    actor_user_id: auth.user.id,
  })

  const { data: coach } = await admin
    .from('coaches')
    .select('user_id')
    .eq('id', conversation.data.coach_id)
    .maybeSingle()
  if (coach?.user_id) {
    await sendNotification({
      userId: coach.user_id,
      type: 'call_requested',
      title: 'Weekly call booked',
      body: 'A client booked a weekly coaching call from Home. Call them when you are ready.',
      actionUrl: `/coach/chat/${conversation.data.id}`,
      metadata: { callRequestId: created.id, conversationId: conversation.data.id },
    })
  }

  return NextResponse.json({ success: true, request: created, deduplicated: false }, { status: 201 })
}
