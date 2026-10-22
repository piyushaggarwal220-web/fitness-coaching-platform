import type { SupabaseClient } from '@supabase/supabase-js'
import { assignCoachToClient } from '@/lib/admin/assign-coach'
import { PIYUSH_COACH_ID } from '@/lib/coach-delivery-policy'
import {
  maxCapturedPaidPaise,
  purchasesQualifyForPiyushHumanCoach,
  type PaidCoachPurchase,
} from '@/lib/coach-routing'

export type CoachRoutingResult = {
  mode: 'ai' | 'human'
  coachId: string | null
  changed: boolean
  maxPaidPaise: number
}

function asPurchase(row: Record<string, unknown>): PaidCoachPurchase {
  return {
    status: (row.status as string | null) ?? null,
    amount_paise: (row.amount_paise as number | null) ?? null,
    refunded_amount_paise: (row.refunded_amount_paise as number | null) ?? null,
    subscription_status: (row.subscription_status as string | null) ?? null,
    plan_slug: (row.plan_slug as string | null) ?? null,
  }
}

export async function loadClientPaidPurchases(
  admin: SupabaseClient,
  clientId: string
): Promise<PaidCoachPurchase[]> {
  const { data, error } = await admin
    .from('purchases')
    .select('status, amount_paise, refunded_amount_paise, subscription_status, plan_slug')
    .eq('user_id', clientId)
    .in('status', ['captured', 'redeemed'])
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(asPurchase)
}

/**
 * High-payers get Piyush as a human coach and lose Smart Coach.
 * Everyone else stays on Smart Coach. Their assigned coach is left as-is.
 */
export async function applyPaidCoachRouting(
  admin: SupabaseClient,
  clientId: string,
  extraPurchases: PaidCoachPurchase[] = []
): Promise<CoachRoutingResult> {
  const purchases = [...(await loadClientPaidPurchases(admin, clientId)), ...extraPurchases]
  const qualify = purchasesQualifyForPiyushHumanCoach(purchases)
  const maxPaidPaise = maxCapturedPaidPaise(purchases)

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('coach_id, coach_service')
    .eq('id', clientId)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)

  const currentCoachId = (profile?.coach_id as string | null) ?? null
  const currentService = (profile?.coach_service as string | null) ?? null

  if (qualify) {
    const alreadyRouted =
      currentCoachId === PIYUSH_COACH_ID && currentService === 'human'
    if (alreadyRouted) {
      return { mode: 'human', coachId: PIYUSH_COACH_ID, changed: false, maxPaidPaise }
    }

    const assigned = await assignCoachToClient(admin, clientId, PIYUSH_COACH_ID, {
      coachService: 'human',
    })
    if (assigned.error) throw new Error(assigned.error)
    return { mode: 'human', coachId: PIYUSH_COACH_ID, changed: true, maxPaidPaise }
  }

  if (currentService === 'ai') {
    return { mode: 'ai', coachId: currentCoachId, changed: false, maxPaidPaise }
  }

  const { error } = await admin
    .from('profiles')
    .update({ coach_service: 'ai', updated_at: new Date().toISOString() })
    .eq('id', clientId)
  if (error) throw new Error(error.message)

  return { mode: 'ai', coachId: currentCoachId, changed: true, maxPaidPaise }
}
