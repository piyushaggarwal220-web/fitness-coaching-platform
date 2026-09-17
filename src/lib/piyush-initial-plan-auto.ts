import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateJourneyPlan } from '@/lib/ai/generate-journey-plan'
import {
  PIYUSH_COACH_ID,
  RAKSHIT_COACH_ID,
  shouldAutoJourneyAndDeliverInitialPlan,
} from '@/lib/coach-delivery-policy'
import { hasClientEntitlement } from '@/lib/entitlements'
import {
  canRetryInitialGeneration,
  enqueueInitialPlanGeneration,
  processInitialPlanGeneration,
  retryInitialPlanGeneration,
  shouldStartInitialGeneration,
  type InitialPlanGenerationJob,
} from '@/lib/initial-plan-generation'
import { deliverPiyushInitialPlan } from '@/lib/piyush-initial-plan-delivery'
import type { OnboardingProfile } from '@/types/database'

export { deliverPiyushInitialPlan } from '@/lib/piyush-initial-plan-delivery'

export type PiyushInitialPlanResult = {
  clientId: string
  name: string
  status: 'sent' | 'skipped' | 'failed' | 'generating'
  detail: string
  planId?: string
  journeyCreated?: boolean
}

async function ensureAiJourneyPlan(
  admin: SupabaseClient,
  profile: OnboardingProfile
): Promise<{ created: boolean; error: string | null }> {
  if (profile.journey_goal?.trim()) {
    return { created: false, error: null }
  }

  try {
    const journey = await generateJourneyPlan(profile)
    const now = new Date().toISOString()
    const { error } = await admin
      .from('profiles')
      .update({
        journey_goal: journey.journey_goal,
        journey_summary: journey.journey_summary,
        updated_at: now,
      })
      .eq('id', profile.id)
      .eq('coach_id', profile.coach_id)

    if (error) return { created: false, error: error.message }
    profile.journey_goal = journey.journey_goal
    profile.journey_summary = journey.journey_summary
    return { created: true, error: null }
  } catch (err) {
    return {
      created: false,
      error: err instanceof Error ? err.message : 'Journey plan generation failed.',
    }
  }
}

/**
 * For one coaching client on an auto-initial coach (Piyush / Rakshit):
 * AI journey (if missing) → generate initial plan → deliver.
 * When processInBackground is true, generation is kicked off and the caller returns early.
 */
export async function runPiyushInitialPlanForClient(
  admin: SupabaseClient,
  clientId: string,
  options?: { processInBackground?: boolean }
): Promise<PiyushInitialPlanResult> {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .maybeSingle()

  if (profileError || !profile) {
    return {
      clientId,
      name: clientId,
      status: 'failed',
      detail: profileError?.message ?? 'Client not found.',
    }
  }

  const typed = profile as OnboardingProfile
  const coachId = typed.coach_id
  if (!shouldAutoJourneyAndDeliverInitialPlan(coachId, typed.created_at)) {
    return {
      clientId,
      name: typed.name?.trim() || clientId,
      status: 'failed',
      detail: 'Coach/client is not on auto initial-plan delivery.',
    }
  }

  const name = typed.name?.trim() || clientId

  if (!typed.onboarding_complete) {
    return { clientId, name, status: 'skipped', detail: 'onboarding incomplete' }
  }
  if (!hasClientEntitlement(typed)) {
    return { clientId, name, status: 'skipped', detail: 'no entitlement' }
  }
  if (typed.email?.includes('@lurvox.test')) {
    return { clientId, name, status: 'skipped', detail: 'trial email' }
  }
  if (typed.plan_delivered) {
    return { clientId, name, status: 'skipped', detail: 'already delivered' }
  }

  const { count: deliveredCount } = await admin
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('delivered_at', 'is', null)
  if ((deliveredCount ?? 0) > 0) {
    return { clientId, name, status: 'skipped', detail: 'delivered plan exists' }
  }

  const journey = await ensureAiJourneyPlan(admin, typed)
  if (journey.error) {
    return { clientId, name, status: 'failed', detail: `journey: ${journey.error}` }
  }

  const { data: existingJob } = await admin
    .from('initial_plan_generation_jobs')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  let job = (existingJob as InitialPlanGenerationJob | null) ?? null

  if (job?.status === 'ready' && job.draft_plan_id) {
    const delivered = await deliverPiyushInitialPlan(admin, {
      clientId,
      coachId: coachId!,
      planId: job.draft_plan_id,
      createdAt: typed.created_at,
    })
    if (delivered.error) {
      return {
        clientId,
        name,
        status: 'failed',
        detail: `deliver: ${delivered.error}`,
        planId: job.draft_plan_id,
        journeyCreated: journey.created,
      }
    }
    if (delivered.heldForReview) {
      return {
        clientId,
        name,
        status: 'skipped',
        detail: 'held for coach review (calorie floor flag)',
        planId: job.draft_plan_id,
        journeyCreated: journey.created,
      }
    }
    return {
      clientId,
      name,
      status: 'sent',
      detail: 'delivered ready draft',
      planId: job.draft_plan_id,
      journeyCreated: journey.created,
    }
  }

  if (!job) {
    const enqueued = await enqueueInitialPlanGeneration(admin, typed)
    if (enqueued.error || !enqueued.job) {
      return {
        clientId,
        name,
        status: 'failed',
        detail: enqueued.error ?? 'Could not queue generation.',
        journeyCreated: journey.created,
      }
    }
    job = enqueued.job
  } else if (canRetryInitialGeneration(job.status, job.started_at)) {
    const retried = await retryInitialPlanGeneration(admin, job)
    if (retried) job = retried
  }

  if (job.status === 'ready' && job.draft_plan_id) {
    const delivered = await deliverPiyushInitialPlan(admin, {
      clientId,
      coachId: coachId!,
      planId: job.draft_plan_id,
      createdAt: typed.created_at,
    })
    if (delivered.error) {
      return {
        clientId,
        name,
        status: 'failed',
        detail: `deliver: ${delivered.error}`,
        planId: job.draft_plan_id,
        journeyCreated: journey.created,
      }
    }
    if (delivered.heldForReview) {
      return {
        clientId,
        name,
        status: 'skipped',
        detail: 'held for coach review (calorie floor flag)',
        planId: job.draft_plan_id,
        journeyCreated: journey.created,
      }
    }
    return {
      clientId,
      name,
      status: 'sent',
      detail: 'delivered after enqueue',
      planId: job.draft_plan_id,
      journeyCreated: journey.created,
    }
  }

  if (options?.processInBackground) {
    if (job.status === 'generating' && canRetryInitialGeneration(job.status, job.started_at)) {
      const retried = await retryInitialPlanGeneration(admin, job)
      if (retried) job = retried
    }
    if (shouldStartInitialGeneration(job.status)) {
      return {
        clientId,
        name,
        status: 'generating',
        detail: `job ${job.id} queued for background generation`,
        journeyCreated: journey.created,
      }
    }
    if (job.status === 'generating') {
      return {
        clientId,
        name,
        status: 'generating',
        detail: `job ${job.id} already generating`,
        journeyCreated: journey.created,
      }
    }
    return {
      clientId,
      name,
      status: 'failed',
      detail: `cannot queue background generation from status ${job.status}`,
      journeyCreated: journey.created,
    }
  }

  if (job.status === 'generating' && canRetryInitialGeneration(job.status, job.started_at)) {
    const retried = await retryInitialPlanGeneration(admin, job)
    if (retried) job = retried
  }

  if (!shouldStartInitialGeneration(job.status)) {
    return {
      clientId,
      name,
      status: 'failed',
      detail: `cannot start generation from status ${job.status}`,
      journeyCreated: journey.created,
    }
  }

  await processInitialPlanGeneration(job.id)

  const { data: refreshed } = await admin
    .from('initial_plan_generation_jobs')
    .select('*')
    .eq('id', job.id)
    .maybeSingle()
  const latest = (refreshed as InitialPlanGenerationJob | null) ?? job

  if (latest.status === 'ready' && latest.draft_plan_id) {
    // processInitialPlanGeneration auto-delivers for auto-initial coaches; verify + re-deliver if needed.
    const { data: plan } = await admin
      .from('plans')
      .select('id, delivered_at, active')
      .eq('id', latest.draft_plan_id)
      .maybeSingle()

    if (plan?.delivered_at && plan.active) {
      return {
        clientId,
        name,
        status: 'sent',
        detail: 'generated and delivered',
        planId: latest.draft_plan_id,
        journeyCreated: journey.created,
      }
    }

    const delivered = await deliverPiyushInitialPlan(admin, {
      clientId,
      coachId: coachId!,
      planId: latest.draft_plan_id,
      createdAt: typed.created_at,
    })
    if (delivered.error) {
      return {
        clientId,
        name,
        status: 'failed',
        detail: `deliver: ${delivered.error}`,
        planId: latest.draft_plan_id,
        journeyCreated: journey.created,
      }
    }
    if (delivered.heldForReview) {
      return {
        clientId,
        name,
        status: 'skipped',
        detail: 'held for coach review (calorie floor flag)',
        planId: latest.draft_plan_id,
        journeyCreated: journey.created,
      }
    }
    return {
      clientId,
      name,
      status: 'sent',
      detail: 'generated and delivered',
      planId: latest.draft_plan_id,
      journeyCreated: journey.created,
    }
  }

  return {
    clientId,
    name,
    status: 'failed',
    detail:
      latest.error_message ??
      `generation ended as ${latest.status}${latest.error_code ? ` (${latest.error_code})` : ''}`,
    journeyCreated: journey.created,
  }
}

/** List auto-initial coaches' clients still waiting on an initial plan (no delivery yet). */
export async function listPiyushPendingInitialPlanClients(
  admin: SupabaseClient,
  limit = 20
): Promise<OnboardingProfile[]> {
  const coachIds = [PIYUSH_COACH_ID, RAKSHIT_COACH_ID]
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .in('coach_id', coachIds)
    .eq('onboarding_complete', true)
    .eq('plan_delivered', false)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error || !data?.length) return []

  const clientIds = data.map((row) => row.id)
  const { data: deliveredPlans } = await admin
    .from('plans')
    .select('client_id')
    .in('client_id', clientIds)
    .not('delivered_at', 'is', null)

  const hasDelivered = new Set((deliveredPlans ?? []).map((p) => p.client_id))
  return (data as OnboardingProfile[]).filter(
    (row) =>
      !hasDelivered.has(row.id) &&
      shouldAutoJourneyAndDeliverInitialPlan(row.coach_id, row.created_at)
  )
}

/**
 * Process up to `limit` clients stuck without a delivered initial plan.
 * Sequential — each full generate can take minutes.
 */
export async function processPiyushPendingInitialPlans(
  admin: SupabaseClient,
  limit = 3,
  options?: { processInBackground?: boolean }
): Promise<PiyushInitialPlanResult[]> {
  const clients = await listPiyushPendingInitialPlanClients(admin, limit)
  const results: PiyushInitialPlanResult[] = []
  for (const client of clients) {
    const result = await runPiyushInitialPlanForClient(admin, client.id, options)
    results.push(result)
  }
  return results
}
