import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadClientCallBookingPolicy } from '@/lib/call-booking-policy-server'
import { getCoachWorkQueue } from '@/lib/coach-work-queue'
import { hasClientEntitlement } from '@/lib/entitlements'
import {
  buildClientCoachQueueView,
  type ClientCoachQueueView,
} from '@/lib/client-coach-queue'

const EMPTY_INELIGIBLE: ClientCoachQueueView = {
  eligible: false,
  withinInitialTwoWeeks: false,
  daysUntilEligible: null,
  planDelivered: false,
  items: [],
  yourCall: null,
  message: 'Coach calls are on the 6-month plan, and on Athletic Body when you paid over ₹3,000.',
}

export async function loadClientCoachQueueView(
  admin: SupabaseClient,
  clientId: string
): Promise<ClientCoachQueueView> {
  const { data: profile } = await admin
    .from('profiles')
    .select(
      'coach_id, plan_delivered, checkin_schedule_started_at, payment_confirmed, access_source, subscription_expires_at'
    )
    .eq('id', clientId)
    .maybeSingle()

  if (!profile || !hasClientEntitlement(profile)) return EMPTY_INELIGIBLE

  const policy = await loadClientCallBookingPolicy(admin, clientId)
  if (!policy.isCallEligiblePlan) return EMPTY_INELIGIBLE

  if (!profile.coach_id) {
    return buildClientCoachQueueView({
      tasks: [],
      clientId,
      planDelivered: Boolean(profile.plan_delivered),
      withinInitialTwoWeeks: policy.withinInitialTwoWeeks,
      daysUntilEligible: policy.daysUntilEligible,
    })
  }

  if (policy.withinInitialTwoWeeks || !profile.plan_delivered) {
    return buildClientCoachQueueView({
      tasks: [],
      clientId,
      planDelivered: Boolean(profile.plan_delivered),
      withinInitialTwoWeeks: policy.withinInitialTwoWeeks,
      daysUntilEligible: policy.daysUntilEligible,
    })
  }

  const tasks = await getCoachWorkQueue(admin, profile.coach_id)

  return buildClientCoachQueueView({
    tasks,
    clientId,
    withinInitialTwoWeeks: policy.withinInitialTwoWeeks,
    daysUntilEligible: policy.daysUntilEligible,
    planDelivered: Boolean(profile.plan_delivered),
  })
}
