import type { SupabaseClient } from '@supabase/supabase-js'
import 'server-only'
import { enforceClientCallPolicy } from '@/lib/call-booking-policy-server'
import { buildPlanSlugByClient } from '@/lib/client-plan-tier'
import { getOrCreateConversation } from '@/lib/coach-chat'
import { hasClientEntitlement } from '@/lib/entitlements'
import {
  getInitialWeeklyCallWindow,
} from '@/lib/weekly-call-timing'

export {
  INITIAL_WEEKLY_CALL_DELAY_MS,
  getInitialWeeklyCallWindow,
} from '@/lib/weekly-call-timing'

const DEFAULT_WEEKDAY = 6
const DEFAULT_HOUR_IST = 11

const IST_WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function getIstWeekday(date: Date): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(date)
  return IST_WEEKDAY[label] ?? 0
}

function getIstYmd(date: Date): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return {
    y: Number(parts.find((p) => p.type === 'year')?.value),
    mo: Number(parts.find((p) => p.type === 'month')?.value),
    d: Number(parts.find((p) => p.type === 'day')?.value),
  }
}

/** Midnight-local IST expressed as UTC. */
function utcFromIstLocal(y: number, mo: number, d: number, h: number, mi: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0, 0) - (5 * 60 + 30) * 60 * 1000)
}

/** Next preferred weekday + hour (IST) at least 1 hour from `after`. */
export function computeNextCallSlotUtc(
  preferredWeekday = DEFAULT_WEEKDAY,
  preferredHourIst = DEFAULT_HOUR_IST,
  after = new Date()
): Date {
  const minMs = after.getTime() + 60 * 60 * 1000
  const start = new Date(after)
  for (let i = 0; i < 21; i++) {
    const probe = new Date(start.getTime() + i * 86_400_000)
    if (getIstWeekday(probe) !== preferredWeekday) continue
    const { y, mo, d } = getIstYmd(probe)
    const slot = utcFromIstLocal(y, mo, d, preferredHourIst, 0)
    if (slot.getTime() >= minMs) return slot
  }
  return new Date(minMs + 7 * 86_400_000)
}

export function computeFollowingWeeklySlot(
  previousScheduledFor: string,
  preferredWeekday = DEFAULT_WEEKDAY,
  preferredHourIst = DEFAULT_HOUR_IST
): Date {
  const prev = new Date(previousScheduledFor)
  if (!Number.isNaN(prev.getTime())) {
    const next = new Date(prev.getTime() + 7 * 86_400_000)
    if (next.getTime() > Date.now() + 60 * 60 * 1000) return next
  }
  return computeNextCallSlotUtc(preferredWeekday, preferredHourIst)
}

export async function getClientPlanSlug(
  admin: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const { data } = await admin
    .from('purchases')
    .select('user_id, plan_slug, status, created_at')
    .eq('user_id', clientId)
    .in('status', ['captured', 'redeemed'])
    .order('created_at', { ascending: false })
    .limit(20)
  return buildPlanSlugByClient(data).get(clientId) ?? null
}

export async function isTwelveMonthEntitledClient(
  admin: SupabaseClient,
  clientId: string
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('payment_confirmed, access_source, subscription_expires_at, plan_delivered')
    .eq('id', clientId)
    .maybeSingle()
  if (!profile || !hasClientEntitlement(profile)) return false
  const slug = await getClientPlanSlug(admin, clientId)
  return slug === '12_months'
}

type EnsureWeeklyCallResult = {
  created: boolean
  callId?: string
  reason?: string
}

/** Past weekly slots that were never marked complete block new auto-schedules. */
async function closeStaleWeeklyCallIfNeeded(
  admin: SupabaseClient,
  clientId: string
): Promise<void> {
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const { data: staleScheduled } = await admin
    .from('call_requests')
    .select('id, scheduled_for, status, source')
    .eq('client_id', clientId)
    .eq('source', 'weekly_entitlement')
    .in('status', ['requested', 'scheduled'])
    .lt('scheduled_for', cutoff)
    .order('scheduled_for', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (staleScheduled?.id) {
    await admin
      .from('call_requests')
      .update({
        status: 'cancelled',
        resolved_at: now,
        coach_note: 'Auto-closed — weekly slot passed without completion',
        updated_at: now,
      })
      .eq('id', staleScheduled.id)
      .in('status', ['requested', 'scheduled'])
    return
  }

  const { data: staleOpen } = await admin
    .from('call_requests')
    .select('id, requested_at, status, source')
    .eq('client_id', clientId)
    .eq('source', 'weekly_entitlement')
    .eq('status', 'requested')
    .is('scheduled_for', null)
    .lt('requested_at', weekAgo)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!staleOpen?.id) return

  await admin
    .from('call_requests')
    .update({
      status: 'cancelled',
      resolved_at: now,
      coach_note: 'Auto-closed — weekly call was not completed within 7 days',
      updated_at: now,
    })
    .eq('id', staleOpen.id)
    .eq('status', 'requested')
}

export async function ensureWeeklyCallForClient(
  admin: SupabaseClient,
  clientId: string,
  options?: { actorUserId?: string; after?: Date }
): Promise<EnsureWeeklyCallResult> {
  const eligible = await isTwelveMonthEntitledClient(admin, clientId)
  if (!eligible) return { created: false, reason: 'not_12_month' }

  const { data: profile } = await admin
    .from('profiles')
    .select(
      'coach_id, preferred_call_weekday, preferred_call_hour_ist, plan_delivered, checkin_schedule_started_at'
    )
    .eq('id', clientId)
    .maybeSingle()
  if (!profile?.coach_id) return { created: false, reason: 'no_coach' }
  if (!profile.plan_delivered) return { created: false, reason: 'plan_not_delivered' }
  if (!profile.checkin_schedule_started_at) {
    return { created: false, reason: 'no_schedule_anchor' }
  }

  await enforceClientCallPolicy(admin, clientId)

  const window = getInitialWeeklyCallWindow(profile.checkin_schedule_started_at)
  if (!window.eligible) {
    return { created: false, reason: 'within_initial_2_weeks' }
  }

  await closeStaleWeeklyCallIfNeeded(admin, clientId)

  const { data: active } = await admin
    .from('call_requests')
    .select('id')
    .eq('client_id', clientId)
    .in('status', ['requested', 'scheduled'])
    .maybeSingle()
  if (active) return { created: false, reason: 'active_call_exists', callId: active.id }

  const { data: conversation, error: convError } = await getOrCreateConversation(admin, clientId)
  if (convError || !conversation) {
    return { created: false, reason: convError ?? 'no_conversation' }
  }

  const { data: coach } = await admin
    .from('coaches')
    .select('user_id')
    .eq('id', profile.coach_id)
    .maybeSingle()
  const actorUserId = options?.actorUserId ?? coach?.user_id ?? clientId

  const now = new Date().toISOString()

  const { data: created, error } = await admin
    .from('call_requests')
    .insert({
      conversation_id: conversation.id,
      client_id: clientId,
      coach_id: profile.coach_id,
      status: 'requested',
      source: 'weekly_entitlement',
      requested_at: now,
      scheduled_for: null,
      coach_note: 'Weekly 12-month coaching call — coach calls when ready',
      updated_by: actorUserId,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { created: false, reason: 'active_call_exists' }
    }
    console.error('[weekly-call] insert failed', { clientId, error: error.message })
    return { created: false, reason: error.message }
  }

  await admin.from('call_request_events').insert({
    call_request_id: created.id,
    from_status: null,
    to_status: 'requested',
    actor_user_id: actorUserId,
    scheduled_for: null,
    note: 'Weekly 12-month call opened — coach calls anytime',
  })

  if (coach?.user_id) {
    const { sendNotification } = await import('@/lib/notifications/dispatcher')
    const { data: clientProfile } = await admin
      .from('profiles')
      .select('name')
      .eq('id', clientId)
      .maybeSingle()
    const name = clientProfile?.name?.trim() || 'Client'
    await sendNotification({
      userId: coach.user_id,
      type: 'call_requested',
      title: 'Weekly call due',
      body: `${name} is due for their weekly 12-month call — call anytime this week.`,
      actionUrl: `/coach/chat/${conversation.id}`,
      metadata: { callRequestId: created.id, conversationId: conversation.id, source: 'weekly_entitlement' },
    })
  }

  const { sendNotification } = await import('@/lib/notifications/dispatcher')
  await sendNotification({
    userId: clientId,
    type: 'call_request_updated',
    title: 'Weekly coach call',
    body: 'Your coach will call you this week when ready — no fixed time slot.',
    actionUrl: '/client/chat',
    metadata: { callRequestId: created.id, status: 'requested' },
  })

  return { created: true, callId: created.id }
}

export async function scheduleNextWeeklyCallAfterCompletion(
  admin: SupabaseClient,
  callRequest: {
    id: string
    client_id: string
    coach_id: string
    scheduled_for: string | null
    source?: string | null
  }
): Promise<EnsureWeeklyCallResult> {
  if (callRequest.source !== 'weekly_entitlement') {
    return { created: false, reason: 'not_weekly_entitlement' }
  }
  const after = callRequest.scheduled_for
    ? computeFollowingWeeklySlot(callRequest.scheduled_for)
    : new Date()
  return ensureWeeklyCallForClient(admin, callRequest.client_id, { after })
}

export async function scheduleWeeklyCallsForAllEligible(
  admin: SupabaseClient
): Promise<{ checked: number; created: number; skipped: number }> {
  const { data: purchases } = await admin
    .from('purchases')
    .select('user_id, plan_slug, status, created_at')
    .eq('plan_slug', '12_months')
    .in('status', ['captured', 'redeemed'])

  const slugByClient = buildPlanSlugByClient(purchases)
  const clientIds = [...slugByClient.keys()]
  if (clientIds.length === 0) return { checked: 0, created: 0, skipped: 0 }

  let created = 0
  let skipped = 0
  for (const clientId of clientIds) {
    const result = await ensureWeeklyCallForClient(admin, clientId)
    if (result.created) created += 1
    else skipped += 1
  }
  return { checked: clientIds.length, created, skipped }
}
