import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  planRequiresCoachReviewBeforeAutoDeliver,
  shouldAutoJourneyAndDeliverInitialPlan,
} from '@/lib/coach-delivery-policy'
import { NotificationTemplates, sendNotification } from '@/lib/notifications/dispatcher'
import { activatePlan } from '@/lib/plans'

/** Deliver a ready initial draft to an auto-initial client and notify them. */
export async function deliverPiyushInitialPlan(
  admin: SupabaseClient,
  input: {
    clientId: string
    coachId: string
    planId: string
    createdAt?: string | null
  }
): Promise<{ error: string | null; heldForReview?: boolean }> {
  if (!shouldAutoJourneyAndDeliverInitialPlan(input.coachId, input.createdAt)) {
    return { error: 'Auto-deliver is only enabled for eligible auto-initial coaching clients.' }
  }

  const { data: planRow } = await admin
    .from('plans')
    .select('id, coach_notes')
    .eq('id', input.planId)
    .maybeSingle()

  if (planRequiresCoachReviewBeforeAutoDeliver(planRow?.coach_notes)) {
    const { data: coach } = await admin
      .from('coaches')
      .select('user_id')
      .eq('id', input.coachId)
      .maybeSingle()
    if (coach?.user_id) {
      await sendNotification({
        userId: coach.user_id,
        type: 'initial_plan_draft_ready',
        title: 'Initial plan held for review',
        body: 'Calorie floor / review flag detected. Open the draft, adjust if needed, then Deliver to client.',
        actionUrl: `/coach/plan/${input.planId}`,
        metadata: {
          planId: input.planId,
          clientId: input.clientId,
          heldForReview: true,
        },
        idempotencyKey: `auto-initial-held-review:${input.planId}`,
      })
    }
    return { error: null, heldForReview: true }
  }

  const activated = await activatePlan(
    admin,
    { id: input.planId, client_id: input.clientId, coach_id: input.coachId },
    { skipReplyWait: true }
  )
  if (activated.error) return activated

  const delivered = NotificationTemplates.planDelivered('Your first coaching plan')
  await sendNotification({
    userId: input.clientId,
    ...delivered,
    body: 'Your coach prepared your first diet and workout plan. Open My Plan to get started.',
    metadata: {
      ...delivered.metadata,
      planId: input.planId,
      piyushAutoDeliver: true,
      messageSnippet: 'Your first coaching plan is ready in the Lurvox app.',
    },
    idempotencyKey: `piyush-initial-plan-delivered:${input.planId}`,
  })

  try {
    const { ensureWeeklyCallForClient } = await import('@/lib/weekly-call-schedule')
    await ensureWeeklyCallForClient(admin, input.clientId)
  } catch (err) {
    console.error('[piyush-initial-plan] weekly call schedule failed', err)
  }

  return { error: null }
}
