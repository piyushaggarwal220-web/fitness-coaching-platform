import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateCallBookingPolicy,
  isWeeklyCallPlanSlug,
  weeklyCallAlreadyBooked,
  weeklyCallLimitMessage,
  type CallBookingPolicy,
} from '@/lib/call-booking-policy'
import { hasClientEntitlement } from '@/lib/entitlements'
import { getClientPlanSlug } from '@/lib/weekly-call-schedule'

async function loadAthleticBodyJoinedAt(
  admin: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const { data: purchase } = await admin
    .from('purchases')
    .select('created_at')
    .eq('user_id', clientId)
    .eq('plan_slug', '12_months')
    .in('status', ['captured', 'redeemed', 'paid', 'completed'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (purchase?.created_at) return purchase.created_at

  const { data: profile } = await admin
    .from('profiles')
    .select('created_at')
    .eq('id', clientId)
    .maybeSingle()
  return profile?.created_at ?? null
}

export async function loadClientCallBookingPolicy(
  admin: SupabaseClient,
  clientId: string
): Promise<CallBookingPolicy> {
  const [{ data: profile }, planSlug, joinedAt] = await Promise.all([
    admin
      .from('profiles')
      .select(
        'plan_delivered, checkin_schedule_started_at, payment_confirmed, access_source, subscription_expires_at'
      )
      .eq('id', clientId)
      .maybeSingle(),
    getClientPlanSlug(admin, clientId),
    loadAthleticBodyJoinedAt(admin, clientId),
  ])

  let policy = evaluateCallBookingPolicy({
    planSlug,
    checkinScheduleStartedAt: profile?.checkin_schedule_started_at ?? null,
    planDelivered: Boolean(profile?.plan_delivered),
    joinedAt,
  })

  if (!hasClientEntitlement(profile)) {
    return {
      ...policy,
      weeklyCallPlan: false,
      canRequestManualCall: false,
      message: null,
    }
  }

  if (!policy.weeklyCallPlan) return policy

  const { data: rows, error } = await admin
    .from('call_requests')
    .select('status, requested_at')
    .eq('client_id', clientId)
    .in('status', ['requested', 'scheduled', 'completed', 'declined'])
    .order('requested_at', { ascending: false })
    .limit(20)

  if (error) {
    return {
      ...policy,
      canRequestManualCall: false,
      message: 'Call booking could not be checked. Try again in a moment.',
    }
  }

  const history = rows ?? []
  const open = history.some((row) => row.status === 'requested' || row.status === 'scheduled')
  const week = weeklyCallAlreadyBooked(history, new Date())
  if (open || week.booked) {
    policy = {
      ...policy,
      canRequestManualCall: false,
      message: weeklyCallLimitMessage(open || week.open),
    }
  }

  return policy
}

/** Cancel open calls that are not a 6-month or 12-month client booking from Home. */
export async function enforceClientCallPolicy(
  admin: SupabaseClient,
  clientId: string
): Promise<void> {
  const planSlug = await getClientPlanSlug(admin, clientId)

  const now = new Date().toISOString()
  const { data: active } = await admin
    .from('call_requests')
    .select('id, source')
    .eq('client_id', clientId)
    .in('status', ['requested', 'scheduled'])

  if (!active?.length) return

  const cancel = async (id: string, note: string) => {
    await admin
      .from('call_requests')
      .update({
        status: 'cancelled',
        resolved_at: now,
        coach_note: note,
        updated_at: now,
      })
      .eq('id', id)
      .in('status', ['requested', 'scheduled'])
  }

  if (!isWeeklyCallPlanSlug(planSlug)) {
    for (const row of active) {
      await cancel(row.id, 'Auto-closed — coach calls are for 6-month and 12-month plans.')
    }
    return
  }

  for (const row of active) {
    if (row.source !== 'client_requested') {
      await cancel(row.id, 'Auto-closed — place a call from Home.')
    }
  }
}
