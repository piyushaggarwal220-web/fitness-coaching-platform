import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateCallBookingPolicy,
  intervalDaysForCadence,
  netPaidPaise,
  type CallBookingPolicy,
} from '@/lib/call-booking-policy'
import { getInitialWeeklyCallWindow } from '@/lib/weekly-call-timing'
import { getClientPlanSlug } from '@/lib/weekly-call-schedule'

const COACHING_SLUGS = ['3_months', '6_months', '12_months', 'offer_1_month', 'offer_3_months', 'offer_84_days']

async function loadClientCoachingPurchase(
  admin: SupabaseClient,
  clientId: string
): Promise<{ planSlug: string | null; paidPaise: number; joinedAt: string | null }> {
  const { data: purchase } = await admin
    .from('purchases')
    .select('plan_slug, amount_paise, refunded_amount_paise, created_at, status')
    .eq('user_id', clientId)
    .in('status', ['captured', 'redeemed'])
    .in('plan_slug', COACHING_SLUGS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (purchase?.plan_slug) {
    return {
      planSlug: purchase.plan_slug,
      paidPaise: netPaidPaise(purchase.amount_paise, purchase.refunded_amount_paise),
      joinedAt: purchase.created_at ?? null,
    }
  }

  const [fallbackSlug, profile] = await Promise.all([
    getClientPlanSlug(admin, clientId),
    admin.from('profiles').select('created_at').eq('id', clientId).maybeSingle(),
  ])
  return {
    planSlug: fallbackSlug,
    paidPaise: 0,
    joinedAt: profile.data?.created_at ?? null,
  }
}

function cooldownMessage(intervalDays: number): string {
  if (intervalDays >= 14) {
    return 'You already had a coach call in the last 2 weeks. You can book the next one after 14 days.'
  }
  return 'You already had a coach call this week. You can book the next one after 7 days.'
}

export async function loadClientCallBookingPolicy(
  admin: SupabaseClient,
  clientId: string
): Promise<CallBookingPolicy> {
  const [{ data: profile }, coaching] = await Promise.all([
    admin
      .from('profiles')
      .select('plan_delivered, checkin_schedule_started_at')
      .eq('id', clientId)
      .maybeSingle(),
    loadClientCoachingPurchase(admin, clientId),
  ])

  const policy = evaluateCallBookingPolicy({
    planSlug: coaching.planSlug,
    paidAmountPaise: coaching.paidPaise,
    checkinScheduleStartedAt: profile?.checkin_schedule_started_at ?? null,
    planDelivered: Boolean(profile?.plan_delivered),
    joinedAt: coaching.joinedAt,
  })

  if (!policy.canRequestManualCall) return policy

  const intervalDays = policy.intervalDays ?? intervalDaysForCadence(policy.callCadence) ?? 7
  const since = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await admin
    .from('call_requests')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .gte('resolved_at', since)
    .limit(1)
    .maybeSingle()

  if (recent?.id) {
    return {
      ...policy,
      canRequestManualCall: false,
      message: cooldownMessage(intervalDays),
    }
  }

  return policy
}

/** Cancel active call requests that violate plan / first-week / amount rules. */
export async function enforceClientCallPolicy(
  admin: SupabaseClient,
  clientId: string
): Promise<void> {
  const [{ data: profile }, coaching] = await Promise.all([
    admin
      .from('profiles')
      .select('checkin_schedule_started_at, plan_delivered')
      .eq('id', clientId)
      .maybeSingle(),
    loadClientCoachingPurchase(admin, clientId),
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
    planSlug: coaching.planSlug,
    paidAmountPaise: coaching.paidPaise,
    checkinScheduleStartedAt: profile?.checkin_schedule_started_at ?? null,
    planDelivered: Boolean(profile?.plan_delivered),
    joinedAt: coaching.joinedAt,
  })

  if (!policy.isCallEligiblePlan) {
    for (const row of active) {
      await cancel(row.id, 'Auto-closed — this plan does not include coach calls.')
    }
    return
  }

  const startedAt = profile?.checkin_schedule_started_at
  if (!startedAt || !profile?.plan_delivered) {
    for (const row of active) {
      await cancel(row.id, 'Auto-closed — coach call books after your plan is delivered')
    }
    return
  }

  const window = getInitialWeeklyCallWindow(startedAt)
  if (!window.eligible) {
    for (const row of active) {
      await cancel(row.id, 'Auto-closed — coach call opens after the first week of coaching')
    }
  }
}
