import type { SupabaseClient } from '@supabase/supabase-js'
import 'server-only'
import { buildPlanSlugByClient } from '@/lib/client-plan-tier'
import { hasClientEntitlement } from '@/lib/entitlements'

export {
  INITIAL_WEEKLY_CALL_DELAY_MS,
  getInitialWeeklyCallWindow,
} from '@/lib/weekly-call-timing'

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

export async function ensureWeeklyCallForClient(
  _admin: SupabaseClient,
  _clientId: string,
  _options?: { actorUserId?: string; after?: Date }
): Promise<EnsureWeeklyCallResult> {
  // Weekly calls are client-started. Cron / plan delivery / check-in paths must not auto-book.
  return { created: false, reason: 'client_initiated_only' }
}

export async function scheduleNextWeeklyCallAfterCompletion(
  _admin: SupabaseClient,
  _callRequest: {
    id: string
    client_id: string
    coach_id: string
    scheduled_for: string | null
    source?: string | null
  }
): Promise<EnsureWeeklyCallResult> {
  return { created: false, reason: 'client_initiated_only' }
}

/** Cancel leftover auto-booked weekly slots. New calls are started by the client. */
export async function cancelAutoBookedWeeklyCalls(
  admin: SupabaseClient
): Promise<{ cancelled: number }> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('call_requests')
    .update({
      status: 'cancelled',
      resolved_at: now,
      coach_note: 'Auto-closed — weekly calls are started by the client, not auto-booked',
      updated_at: now,
    })
    .eq('source', 'weekly_entitlement')
    .in('status', ['requested', 'scheduled'])
    .select('id')

  if (error) {
    console.error('[weekly-call] cancel auto-booked failed', error.message)
    return { cancelled: 0 }
  }
  return { cancelled: data?.length ?? 0 }
}

export async function scheduleWeeklyCallsForAllEligible(
  admin: SupabaseClient
): Promise<{ checked: number; created: number; skipped: number }> {
  const cancelled = await cancelAutoBookedWeeklyCalls(admin)
  return { checked: cancelled.cancelled, created: 0, skipped: cancelled.cancelled }
}
