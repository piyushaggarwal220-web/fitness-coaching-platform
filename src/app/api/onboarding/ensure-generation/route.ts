import { after, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  canRetryInitialGeneration,
  enqueueInitialPlanGeneration,
  processInitialPlanGeneration,
  retryInitialPlanGeneration,
  shouldStartInitialGeneration,
  type InitialPlanGenerationJob,
} from '@/lib/initial-plan-generation'
import { shouldAutoEnqueueInitialPlan, shouldAutoJourneyAndDeliverInitialPlan } from '@/lib/coach-delivery-policy'
import {
  latestCoachingPurchase,
  latestDigitalPurchase,
} from '@/lib/payments/digital-purchase'
import { clientHasDeliveredPlanStrict } from '@/lib/plans-delivery-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Safety net: if onboarding completed but the initial AI job never started
 * (or is stuck queued/failed), kick generation again. Idempotent.
 */
export async function POST() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const completed = profile as OnboardingProfile
  if (!completed.onboarding_complete || !completed.onboarding_completed_at) {
    return NextResponse.json({ error: 'Onboarding is not complete.' }, { status: 409 })
  }
  if (completed.plan_delivered) {
    return NextResponse.json({ success: true, status: 'skipped', reason: 'plan_already_delivered' })
  }

  const deliveredGuard = await clientHasDeliveredPlanStrict(admin, auth.user.id)
  if (deliveredGuard.error) {
    return NextResponse.json(
      { error: `Could not verify delivery history: ${deliveredGuard.error}` },
      { status: 503 }
    )
  }
  if (deliveredGuard.delivered) {
    return NextResponse.json({ success: true, status: 'skipped', reason: 'plan_already_delivered' })
  }

  const [digitalPurchase, coachingPurchase] = await Promise.all([
    latestDigitalPurchase(admin, auth.user.id),
    latestCoachingPurchase(admin, auth.user.id),
  ])
  const hasDigital = Boolean(digitalPurchase)
  const isInstantOnly = hasDigital && !coachingPurchase

  if (
    !isInstantOnly &&
    shouldAutoJourneyAndDeliverInitialPlan(completed.coach_id, completed.created_at)
  ) {
    after(() =>
      import('@/lib/piyush-initial-plan-auto')
        .then(({ runPiyushInitialPlanForClient }) =>
          runPiyushInitialPlanForClient(admin, auth.user.id)
        )
        .catch((err) => {
          console.error(
            '[onboarding/ensure-generation] Piyush auto initial plan failed:',
            err instanceof Error ? err.message : err
          )
        })
    )
    return NextResponse.json({
      success: true,
      status: 'generating',
      reason: 'piyush_auto_journey_deliver',
    }, { status: 202 })
  }

  if (!shouldAutoEnqueueInitialPlan(completed, { digitalPurchase: hasDigital })) {
    return NextResponse.json({
      success: true,
      status: 'awaiting_coach_journey',
      reason: 'manual_coach_delivery',
    })
  }

  const result = await enqueueInitialPlanGeneration(admin, completed)
  if (result.error || !result.job) {
    return NextResponse.json({ error: result.error ?? 'Could not queue generation' }, { status: 422 })
  }

  let job = result.job
  if (job.status === 'ready' && job.draft_plan_id) {
    return NextResponse.json({ success: true, status: 'ready', jobId: job.id, draftPlanId: job.draft_plan_id })
  }

  if (result.deduplicated && canRetryInitialGeneration(job.status, job.started_at)) {
    const retried = await retryInitialPlanGeneration(admin, job as InitialPlanGenerationJob)
    if (retried) job = retried
  }

  if (shouldStartInitialGeneration(job.status)) {
    after(() =>
      processInitialPlanGeneration(job.id).catch((err) => {
        console.error(
          '[onboarding/ensure-generation] background generation failed:',
          err instanceof Error ? err.message : err
        )
      })
    )
  }

  return NextResponse.json({
    success: true,
    status: job.status,
    jobId: job.id,
    started: shouldStartInitialGeneration(job.status),
  })
}
