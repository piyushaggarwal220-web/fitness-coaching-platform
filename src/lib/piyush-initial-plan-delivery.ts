import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { shouldAutoJourneyAndDeliverInitialPlan } from '@/lib/coach-delivery-policy'
import { NotificationTemplates, sendNotification } from '@/lib/notifications/dispatcher'
import { activatePlan } from '@/lib/plans'

/** Deliver a ready initial draft to a Piyush client and notify them. */
export async function deliverPiyushInitialPlan(
  admin: SupabaseClient,
  input: {
    clientId: string
    coachId: string
    planId: string
  }
): Promise<{ error: string | null }> {
  if (!shouldAutoJourneyAndDeliverInitialPlan(input.coachId)) {
    return { error: 'Auto-deliver is only enabled for auto-initial coaching coaches.' }
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
