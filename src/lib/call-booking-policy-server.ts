import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateCallBookingPolicy,
  type CallBookingPolicy,
} from '@/lib/call-booking-policy'
import { getInitialWeeklyCallWindow } from '@/lib/weekly-call-timing'
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
      .select('plan_delivered, checkin_schedule_started_at')
      .eq('id', clientId)
      .maybeSingle(),
    getClientPlanSlug(admin, clientId),
    loadAthleticBodyJoinedAt(admin, clientId),
  ])

  const policy = evaluateCallBookingPolicy({
    planSlug,
    checkinScheduleStartedAt: profile?.checkin_schedule_started_at ?? null,
    planDelivered: Boolean(profile?.plan_delivered),
    joinedAt,
  })

  if (!policy.canRequestManualCall) return policy

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await admin
    .from('call_requests')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .gte('resolved_at', weekAgo)
    .limit(1)
    .maybeSingle()

  if (recent?.id) {
    return {
      ...policy,
      canRequestManualCall: false,
      message: 'You already had a coach call this week. You can book the next one after 7 days.',
    }
  }

  return policy
}

/** Cancel active call requests that violate plan / first-week / new-client rules. */
export async function enforceClientCallPolicy(
  admin: SupabaseClient,
  clientId: string
): Promise<void> {
  const [{ data: profile }, planSlug, joinedAt] = await Promise.all([
    admin
      .from('profiles')
      .select('checkin_schedule_started_at')
      .eq('id', clientId)
      .maybeSingle(),
    getClientPlanSlug(admin, clientId),
    loadAthleticBodyJoinedAt(admin, clientId),
  ])

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

  const policy = evaluateCallBookingPolicy({
    planSlug,
    checkinScheduleStartedAt: profile?.checkin_schedule_started_at ?? null,
    planDelivered: true,
    joinedAt,
  })

  if (!policy.isGrandfatheredAthleticBody) {
    for (const row of active) {
      await cancel(row.id, 'Auto-closed — weekly calls are only for existing Athletic Body clients')
    }
    return
  }

  const startedAt = profile?.checkin_schedule_started_at
  if (!startedAt) {
    for (const row of active) {
      await cancel(row.id, 'Auto-closed — weekly call books after your plan is delivered')
    }
    return
  }

  const window = getInitialWeeklyCallWindow(startedAt)
  if (!window.eligible) {
    for (const row of active) {
      await cancel(row.id, 'Auto-closed — weekly call opens after the first week of coaching')
    }
  }
}
