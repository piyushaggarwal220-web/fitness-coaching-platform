import { after, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { invalidateForEvent } from '@/lib/ai/prompt-cache'
import {
  canRetryInitialGeneration,
  enqueueInitialPlanGeneration,
  processInitialPlanGeneration,
  retryInitialPlanGeneration,
  shouldStartInitialGeneration,
  type InitialPlanGenerationJob,
  validatePersistedOnboardingAnswers,
} from '@/lib/initial-plan-generation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function clientHasDeliveredPlan(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  planDeliveredFlag: boolean | null | undefined
): Promise<boolean> {
  if (planDeliveredFlag === true) return true
  const { count } = await admin
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('delivered_at', 'is', null)
  return (count ?? 0) > 0
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { termsAccepted?: boolean } | null

  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (error || !profile) {
    if (error) {
      console.error('[onboarding/complete-generation] profile reread failed:', error.message)
      return NextResponse.json({ error: 'Completed onboarding could not be verified.' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const persistedProfile = profile as OnboardingProfile
  const termsAccepted = Boolean(profile.terms_accepted_at) || body?.termsAccepted === true
  const alreadyHasPlan = await clientHasDeliveredPlan(
    admin,
    auth.user.id,
    persistedProfile.plan_delivered
  )

  // Clients who already received a plan do not need AI generation queued again.
  // Still require terms, but do not block completion on newly added intake fields.
  if (!alreadyHasPlan) {
    const validationError = validatePersistedOnboardingAnswers(persistedProfile, { termsAccepted })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 422 })
    }
  } else if (!termsAccepted) {
    return NextResponse.json({ error: 'You must accept the terms to complete onboarding.' }, { status: 422 })
  }

  // Completion is privileged workflow state. Finalize it on the authenticated
  // server only after validating the answers already persisted by this user.
  // Repeating this request preserves the original completion timestamp.
  let completedProfile = persistedProfile
  if (!profile.onboarding_complete || !profile.onboarding_completed_at || !profile.terms_accepted_at) {
    const completedAt = profile.onboarding_completed_at ?? new Date().toISOString()
    const { data: updated, error: completionError } = await admin
      .from('profiles')
      .update({
        onboarding_complete: true,
        onboarding_completed_at: completedAt,
        terms_accepted_at: profile.terms_accepted_at ?? completedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.user.id)
      .select('*')
      .single()

    if (completionError || !updated) {
      return NextResponse.json(
        { error: completionError?.message ?? 'Could not persist onboarding completion' },
        { status: 500 }
      )
    }
    completedProfile = updated as OnboardingProfile
  }

  if (
    !completedProfile.onboarding_complete ||
    !completedProfile.onboarding_completed_at ||
    !completedProfile.terms_accepted_at
  ) {
    return NextResponse.json(
      { error: 'Onboarding completion could not be verified' },
      { status: 409 }
    )
  }

  await invalidateForEvent('onboarding_submitted', auth.user.id)

  if (alreadyHasPlan) {
    return NextResponse.json({
      success: true,
      status: 'skipped',
      reason: 'plan_already_delivered',
      deduplicated: true,
    })
  }

  const result = await enqueueInitialPlanGeneration(admin, completedProfile)
  if (result.error || !result.job) {
    console.error(
      '[onboarding/complete-generation] queue rejected:',
      result.error ?? 'job unavailable'
    )
    return NextResponse.json({ error: result.error ?? 'Could not queue generation' }, { status: 422 })
  }

  let job = result.job
  if (job.status === 'ready' && job.draft_plan_id) {
    return NextResponse.json({
      success: true,
      status: 'ready',
      deduplicated: result.deduplicated,
      draftPlanId: job.draft_plan_id,
    })
  }

  if (
    result.deduplicated &&
    canRetryInitialGeneration(job.status, job.started_at)
  ) {
    const retried = await retryInitialPlanGeneration(
      admin,
      job as InitialPlanGenerationJob
    )
    if (retried) job = retried
  }

  if (shouldStartInitialGeneration(job.status)) {
    after(() =>
      processInitialPlanGeneration(job.id).catch((err) => {
        console.error(
          '[onboarding/complete-generation] background generation failed:',
          err instanceof Error ? err.message : err
        )
      })
    )
  }

  return NextResponse.json({
    success: true,
    status: job.status,
    deduplicated: result.deduplicated,
  }, { status: result.deduplicated ? 200 : 202 })
}
