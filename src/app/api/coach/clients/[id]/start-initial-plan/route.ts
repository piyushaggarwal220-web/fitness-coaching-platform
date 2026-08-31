import { after, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { coachRequiresManualPlanDelivery } from '@/lib/coach-delivery-policy'
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

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { id: clientId } = await context.params
  if (!clientId?.trim()) {
    return NextResponse.json({ error: 'Client id is required.' }, { status: 400 })
  }

  const { data: coach } = await auth.supabase
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (!coach) {
    return NextResponse.json({ error: 'Coach access required.' }, { status: 403 })
  }

  if (!coachRequiresManualPlanDelivery(coach.id)) {
    return NextResponse.json(
      { error: 'Coach-triggered initial plans are only used for manual-delivery coaches.' },
      { status: 403 }
    )
  }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }
  if (!profile) {
    return NextResponse.json({ error: 'Client not found or not assigned to you.' }, { status: 404 })
  }

  if (!profile.onboarding_complete) {
    return NextResponse.json({ error: 'Client has not finished onboarding yet.' }, { status: 409 })
  }

  if (!profile.journey_goal?.trim()) {
    return NextResponse.json(
      { error: 'Set the client journey plan before generating a draft.' },
      { status: 422 }
    )
  }

  if (profile.plan_delivered) {
    return NextResponse.json({ error: 'Client already has a delivered plan.' }, { status: 409 })
  }

  const { count: deliveredCount } = await admin
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('delivered_at', 'is', null)

  if ((deliveredCount ?? 0) > 0) {
    return NextResponse.json({ error: 'Client already has a delivered plan.' }, { status: 409 })
  }

  const result = await enqueueInitialPlanGeneration(admin, profile as OnboardingProfile)
  if (result.error || !result.job) {
    return NextResponse.json({ error: result.error ?? 'Could not queue generation.' }, { status: 422 })
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

  if (result.deduplicated && canRetryInitialGeneration(job.status, job.started_at)) {
    const retried = await retryInitialPlanGeneration(admin, job as InitialPlanGenerationJob)
    if (retried) job = retried
  }

  if (shouldStartInitialGeneration(job.status)) {
    after(() =>
      processInitialPlanGeneration(job.id).catch((err) => {
        console.error(
          '[coach/start-initial-plan] background generation failed:',
          err instanceof Error ? err.message : err
        )
      })
    )
  }

  return NextResponse.json(
    {
      success: true,
      status: job.status,
      deduplicated: result.deduplicated,
      jobId: job.id,
    },
    { status: result.deduplicated ? 200 : 202 }
  )
}
