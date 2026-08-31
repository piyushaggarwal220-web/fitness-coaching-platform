import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateCallBookingPolicy,
  type CallBookingPolicy,
} from '@/lib/call-booking-policy'
import { getInitialWeeklyCallWindow } from '@/lib/weekly-call-timing'
import { getClientPlanSlug } from '@/lib/weekly-call-schedule'

export async function loadClientCallBookingPolicy(
  admin: SupabaseClient,
  clientId: string
): Promise<CallBookingPolicy> {
  const [{ data: profile }, planSlug] = await Promise.all([
    admin
      .from('profiles')
      .select('plan_delivered, checkin_schedule_started_at')
      .eq('id', clientId)
      .maybeSingle(),
    getClientPlanSlug(admin, clientId),
  ])

  return evaluateCallBookingPolicy({
    planSlug,
    checkinScheduleStartedAt: profile?.checkin_schedule_started_at ?? null,
    planDelivered: Boolean(profile?.plan_delivered),
  })
}

/** Cancel active call requests that violate plan / 2-week rules. */
export async function enforceClientCallPolicy(
  admin: SupabaseClient,
  clientId: string
): Promise<void> {
  const [{ data: profile }, planSlug] = await Promise.all([
    admin
      .from('profiles')
      .select('checkin_schedule_started_at')
      .eq('id', clientId)
      .maybeSingle(),
    getClientPlanSlug(admin, clientId),
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

  if (planSlug !== '12_months') {
    for (const row of active) {
      await cancel(row.id, 'Auto-closed — phone calls are for 12-month members only')
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
      await cancel(
        row.id,
        row.source === 'weekly_entitlement'
          ? 'Auto-closed — weekly calls start after the first 2 coaching weeks'
          : 'Auto-closed — calls unlock after the first 2 coaching weeks'
      )
    }
    return
  }

  for (const row of active) {
    if (row.source === 'client_requested') {
      await cancel(
        row.id,
        'Auto-closed — weekly calls are scheduled automatically for 12-month members'
      )
    }
  }
}
