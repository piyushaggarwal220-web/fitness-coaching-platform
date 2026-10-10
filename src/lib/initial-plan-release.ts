import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { shouldAutoJourneyAndDeliverInitialPlan } from '@/lib/coach-delivery-policy'
import { instantPlanWindowOpen } from '@/lib/plan-delivery-window'
import { autoDeliverDigitalPlan } from '@/lib/payments/digital-delivery'
import { latestPurchasePlanSlug } from '@/lib/payments/digital-purchase'
import { deliverPiyushInitialPlan } from '@/lib/piyush-initial-plan-delivery'

type ReadyJob = {
  client_id: string
  coach_id: string
  draft_plan_id: string
  product_kind: string | null
}

/**
 * Send ready auto plans whose 1–2 hour window has opened.
 * Generation can finish earlier; this is what actually delivers them.
 */
export async function releaseDueInitialPlans(
  admin: SupabaseClient,
  limit = 8
): Promise<number> {
  const { data, error } = await admin
    .from('initial_plan_generation_jobs')
    .select('client_id, coach_id, draft_plan_id, product_kind, completed_at')
    .eq('status', 'ready')
    .not('draft_plan_id', 'is', null)
    .order('completed_at', { ascending: true })
    .limit(40)

  if (error || !data?.length) {
    if (error) console.error('[initial-plan-release] query failed:', error.message)
    return 0
  }

  let released = 0
  for (const job of data as ReadyJob[]) {
    if (released >= limit) break
    if (!job.draft_plan_id) continue

    const { data: profile } = await admin
      .from('profiles')
      .select('id, onboarding_completed_at, plan_delivered, created_at')
      .eq('id', job.client_id)
      .maybeSingle()

    if (!profile || profile.plan_delivered) continue
    if (!instantPlanWindowOpen(profile.onboarding_completed_at, profile.id)) continue

    const { data: plan } = await admin
      .from('plans')
      .select('id, delivered_at, active')
      .eq('id', job.draft_plan_id)
      .maybeSingle()
    if (plan?.delivered_at && plan.active) continue

    if (job.product_kind === 'digital') {
      const planSlug = await latestPurchasePlanSlug(admin, job.client_id)
      const delivered = await autoDeliverDigitalPlan(admin, {
        clientId: job.client_id,
        coachId: job.coach_id,
        planId: job.draft_plan_id,
        planSlug,
      })
      if (!delivered.error && !delivered.heldForWindow) released += 1
      continue
    }

    if (!shouldAutoJourneyAndDeliverInitialPlan(job.coach_id, profile.created_at)) continue
    const delivered = await deliverPiyushInitialPlan(admin, {
      clientId: job.client_id,
      coachId: job.coach_id,
      planId: job.draft_plan_id,
      createdAt: profile.created_at,
    })
    if (!delivered.error && !delivered.heldForWindow && !delivered.heldForReview) released += 1
  }

  return released
}
