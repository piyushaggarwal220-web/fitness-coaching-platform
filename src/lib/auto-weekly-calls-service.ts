import 'server-only'

import { getAutoWeeklyCallSlot } from '@/lib/auto-weekly-calls'
import { getOrCreateConversation } from '@/lib/coach-chat'
import { hasClientEntitlement } from '@/lib/entitlements'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTwelveMonthActiveSubscription } from '@/lib/auto-weekly-calls'
import type { CallRequest, Purchase } from '@/types/database'

export type AutoWeeklyCallResult =
  | { status: 'created'; callRequestId: string; coachingWeek: number; conversationId: string }
  | { status: 'already_booked'; callRequestId: string; coachingWeek: number }
  | { status: 'skipped'; reason: string; coachingWeek?: number }

type EligibleClientRow = {
  id: string
  name: string | null
  coach_id: string | null
  checkin_schedule_started_at: string
  payment_confirmed: boolean | null
  access_source: 'purchase' | 'admin_trial' | 'enrollment_code' | null
  subscription_expires_at: string | null
}

async function loadLatestCapturedPurchases(
  admin: ReturnType<typeof createAdminClient>,
  clientIds: string[]
): Promise<Map<string, Pick<Purchase, 'user_id' | 'plan_slug' | 'plan_name' | 'created_at' | 'status'>>> {
  const latest = new Map<
    string,
    Pick<Purchase, 'user_id' | 'plan_slug' | 'plan_name' | 'created_at' | 'status'>
  >()
  if (clientIds.length === 0) return latest

  const { data, error } = await admin
    .from('purchases')
    .select('user_id, plan_slug, plan_name, created_at, status')
    .in('user_id', clientIds)
    .eq('status', 'captured')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const userId = row.user_id as string
    if (latest.has(userId)) continue
    latest.set(userId, row as Pick<Purchase, 'user_id' | 'plan_slug' | 'plan_name' | 'created_at' | 'status'>)
  }

  return latest
}

export async function listTwelveMonthClientsForAutoWeeklyCalls(
  referenceDate: Date = new Date()
): Promise<EligibleClientRow[]> {
  const admin = createAdminClient()
  const { data: profiles, error } = await admin
    .from('profiles')
    .select(
      'id, name, coach_id, checkin_schedule_started_at, payment_confirmed, access_source, subscription_expires_at'
    )
    .eq('role', 'client')
    .not('checkin_schedule_started_at', 'is', null)
    .not('coach_id', 'is', null)

  if (error) throw new Error(error.message)

  const entitled = ((profiles ?? []) as EligibleClientRow[]).filter(
    (profile) => profile.checkin_schedule_started_at && hasClientEntitlement(profile)
  )
  const purchases = await loadLatestCapturedPurchases(
    admin,
    entitled.map((profile) => profile.id)
  )

  return entitled.filter((profile) =>
    isTwelveMonthActiveSubscription(
      purchases.get(profile.id),
      profile.subscription_expires_at,
      referenceDate
    )
  )
}

async function findExistingAutoWeeklyCall(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  coachingWeek: number
): Promise<CallRequest | null> {
  const { data, error } = await admin
    .from('call_requests')
    .select('*')
    .eq('client_id', clientId)
    .eq('source', 'auto_weekly')
    .eq('coaching_week', coachingWeek)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as CallRequest | null) ?? null
}

/**
 * Ensure a Day-7 weekly call request exists for a 12-month client.
 * Creates status `requested` so the assigned coach can pick a time.
 */
export async function ensureAutoWeeklyCallForClient(
  client: EligibleClientRow,
  referenceDate: Date = new Date()
): Promise<AutoWeeklyCallResult> {
  if (!client.checkin_schedule_started_at) {
    return { status: 'skipped', reason: 'schedule_not_anchored' }
  }
  if (!client.coach_id) {
    return { status: 'skipped', reason: 'no_coach' }
  }

  const slot = getAutoWeeklyCallSlot(client.checkin_schedule_started_at, referenceDate)
  if (!slot) {
    return { status: 'skipped', reason: 'not_day_7_window' }
  }

  const admin = createAdminClient()
  const existing = await findExistingAutoWeeklyCall(admin, client.id, slot.coachingWeek)
  if (existing) {
    return {
      status: 'already_booked',
      callRequestId: existing.id,
      coachingWeek: slot.coachingWeek,
    }
  }

  const { data: active } = await admin
    .from('call_requests')
    .select('*')
    .eq('client_id', client.id)
    .in('status', ['requested', 'scheduled'])
    .maybeSingle()

  if (active) {
    // An open manual/previous call already covers the client until the coach resolves it.
    return {
      status: 'skipped',
      reason: 'active_call_exists',
      coachingWeek: slot.coachingWeek,
    }
  }

  const { data: conversation, error: conversationError } = await getOrCreateConversation(
    admin,
    client.id
  )
  if (conversationError || !conversation) {
    return {
      status: 'skipped',
      reason: conversationError ?? 'conversation_unavailable',
      coachingWeek: slot.coachingWeek,
    }
  }

  const now = new Date().toISOString()
  const coachNote = `Auto-booked weekly call · Week ${slot.coachingWeek} (Day 7)`

  const { data: created, error } = await admin
    .from('call_requests')
    .insert({
      conversation_id: conversation.id,
      client_id: client.id,
      coach_id: conversation.coach_id,
      status: 'requested',
      source: 'auto_weekly',
      coaching_week: slot.coachingWeek,
      coach_note: coachNote,
      updated_by: client.id,
      requested_at: now,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const raced = await findExistingAutoWeeklyCall(admin, client.id, slot.coachingWeek)
      if (raced) {
        return {
          status: 'already_booked',
          callRequestId: raced.id,
          coachingWeek: slot.coachingWeek,
        }
      }
      return {
        status: 'skipped',
        reason: 'active_call_exists',
        coachingWeek: slot.coachingWeek,
      }
    }
    throw new Error(error.message)
  }

  await admin.from('call_request_events').insert({
    call_request_id: created.id,
    from_status: null,
    to_status: 'requested',
    actor_user_id: client.id,
    note: coachNote,
  })

  await admin.from('conversation_messages').insert({
    conversation_id: conversation.id,
    sender_type: 'system',
    sender_id: null,
    message_type: 'system',
    content: `Weekly coaching call for week ${slot.coachingWeek} was booked automatically (Day 7). Your coach will schedule a time.`,
    created_at: now,
  })

  const { data: coach } = await admin
    .from('coaches')
    .select('user_id')
    .eq('id', conversation.coach_id)
    .maybeSingle()

  if (coach?.user_id) {
    const clientLabel = client.name?.trim() || 'A 12-month client'
    await sendNotification({
      userId: coach.user_id,
      type: 'call_requested',
      title: 'Weekly call auto-booked',
      body: `${clientLabel} has a Day 7 weekly call ready to schedule (Week ${slot.coachingWeek}).`,
      actionUrl: `/coach/chat/${conversation.id}`,
      idempotencyKey: `auto-weekly-call:${client.id}:${slot.coachingWeek}`,
      metadata: {
        callRequestId: created.id,
        conversationId: conversation.id,
        coachingWeek: slot.coachingWeek,
        source: 'auto_weekly',
      },
    })
  }

  await sendNotification({
    userId: client.id,
    type: 'call_request_updated',
    title: 'Weekly coach call booked',
    body: `Your week ${slot.coachingWeek} coaching call was booked automatically. Your coach will confirm the time.`,
    actionUrl: '/client/chat',
    idempotencyKey: `auto-weekly-call-client:${client.id}:${slot.coachingWeek}`,
    metadata: {
      callRequestId: created.id,
      conversationId: conversation.id,
      coachingWeek: slot.coachingWeek,
      source: 'auto_weekly',
      status: 'requested',
    },
  })

  return {
    status: 'created',
    callRequestId: created.id as string,
    coachingWeek: slot.coachingWeek,
    conversationId: conversation.id,
  }
}

export async function runAutoWeeklyCallBookings(
  referenceDate: Date = new Date()
): Promise<{
  checked: number
  created: number
  alreadyBooked: number
  skipped: number
  details: Array<{ clientId: string } & AutoWeeklyCallResult>
}> {
  const clients = await listTwelveMonthClientsForAutoWeeklyCalls(referenceDate)
  const details: Array<{ clientId: string } & AutoWeeklyCallResult> = []
  let created = 0
  let alreadyBooked = 0
  let skipped = 0

  for (const client of clients) {
    try {
      const result = await ensureAutoWeeklyCallForClient(client, referenceDate)
      details.push({ clientId: client.id, ...result })
      if (result.status === 'created') created += 1
      else if (result.status === 'already_booked') alreadyBooked += 1
      else skipped += 1
    } catch (error) {
      skipped += 1
      details.push({
        clientId: client.id,
        status: 'skipped',
        reason: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  return {
    checked: clients.length,
    created,
    alreadyBooked,
    skipped,
    details,
  }
}
