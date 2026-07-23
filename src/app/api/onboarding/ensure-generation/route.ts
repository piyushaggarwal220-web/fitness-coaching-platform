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

  const { count: deliveredCount } = await admin
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', auth.user.id)
    .not('delivered_at', 'is', null)
  if ((deliveredCount ?? 0) > 0) {
    return NextResponse.json({ success: true, status: 'skipped', reason: 'plan_already_delivered' })
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
