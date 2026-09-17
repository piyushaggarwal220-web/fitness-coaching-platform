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
import { latestCoachingPurchase, latestDigitalPurchase } from '@/lib/payments/digital-purchase'
import { isDigitalPlanSlug } from '@/lib/payments/plans'
import { clientHasDeliveredPlanStrict } from '@/lib/plans-delivery-guard'
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
    // CAS: only the first writer fills an empty journey. Concurrent callers lose and reload.
    const { data: updated, error } = await admin
      .from('profiles')
      .update({
        journey_goal: journey.journey_goal,
        journey_summary: journey.journey_summary,
        updated_at: now,
      })
      .eq('id', profile.id)
      .eq('coach_id', profile.coach_id)
      .is('journey_goal', null)
      .select('id')
      .maybeSingle()

    if (error) return { created: false, error: error.message }

    if (!updated) {
      const { data: fresh, error: reloadError } = await admin
        .from('profiles')
        .select('journey_goal, journey_summary, coach_id')
        .eq('id', profile.id)
        .maybeSingle()
      if (reloadError) return { created: false, error: reloadError.message }
      if (fresh?.coach_id !== profile.coach_id) {
        return { created: false, error: 'Coach assignment changed during journey generation.' }
      }
      if (fresh?.journey_goal?.trim()) {
        profile.journey_goal = fresh.journey_goal
        profile.journey_summary = fresh.journey_summary
        return { created: false, error: null }
      }
      return { created: false, error: 'Could not claim journey write.' }
    }

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

  // Instant-only buyers must use digital fulfillment, not coaching auto-journey.
  const digitalPurchase = await latestDigitalPurchase(admin, clientId)
  const coachingPurchase = await latestCoachingPurchase(admin, clientId)
  if (digitalPurchase && !coachingPurchase) {
    return {
      clientId,
      name,
      status: 'skipped',
      detail: 'digital Instant purchase — use Instant fulfillment',
    }
  }

  const deliveredGuard = await clientHasDeliveredPlanStrict(admin, clientId)
  if (deliveredGuard.error) {
    return {
      clientId,
      name,
      status: 'failed',
      detail: `delivery history lookup failed: ${deliveredGuard.error}`,
    }
  }
  if (deliveredGuard.delivered) {
    return { clientId, name, status: 'skipped', detail: 'delivered plan exists' }
  }

  // Claim/create the generation job before paying for journey AI.
  const { data: existingJob } = await admin
    .from('initial_plan_generation_jobs')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  let job = (existingJob as InitialPlanGenerationJob | null) ?? null
  let journeyCreated = false

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
      }
    }
    if (delivered.heldForReview) {
      return {
        clientId,
        name,
        status: 'skipped',
        detail: 'held for coach review (calorie floor flag)',
        planId: job.draft_plan_id,
      }
    }
    return {
      clientId,
      name,
      status: 'sent',
      detail: 'delivered ready draft',
      planId: job.draft_plan_id,
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
      }
    }
    job = enqueued.job
  } else if (canRetryInitialGeneration(job.status, job.started_at)) {
    const retried = await retryInitialPlanGeneration(admin, job)
    if (retried) job = retried
  }

  // Skip Instant-stamped jobs on the coaching auto path.
  if (job.product_kind === 'digital') {
    return {
      clientId,
      name,
      status: 'skipped',
      detail: 'job is stamped Instant digital — coaching auto path skipped',
    }
  }

  const journey = await ensureAiJourneyPlan(admin, typed)
  if (journey.error) {
    return { clientId, name, status: 'failed', detail: `journey: ${journey.error}` }
  }
  journeyCreated = journey.created

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
        journeyCreated,
      }
    }
    if (delivered.heldForReview) {
      return {
        clientId,
        name,
        status: 'skipped',
        detail: 'held for coach review (calorie floor flag)',
        planId: job.draft_plan_id,
        journeyCreated,
      }
    }
    return {
      clientId,
      name,
      status: 'sent',
      detail: 'delivered after enqueue',
      planId: job.draft_plan_id,
      journeyCreated,
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
        journeyCreated,
      }
    }
    if (job.status === 'generating') {
      return {
        clientId,
        name,
        status: 'generating',
        detail: `job ${job.id} already generating`,
        journeyCreated,
      }
    }
    return {
      clientId,
      name,
      status: 'failed',
      detail: `cannot queue background generation from status ${job.status}`,
      journeyCreated,
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
      journeyCreated,
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
        journeyCreated,
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
        journeyCreated,
      }
    }
    if (delivered.heldForReview) {
      return {
        clientId,
        name,
        status: 'skipped',
        detail: 'held for coach review (calorie floor flag)',
        planId: latest.draft_plan_id,
        journeyCreated,
      }
    }
    return {
      clientId,
      name,
      status: 'sent',
      detail: 'generated and delivered',
      planId: latest.draft_plan_id,
      journeyCreated,
    }
  }

  return {
    clientId,
    name,
    status: 'failed',
    detail:
      latest.error_message ??
      `generation ended as ${latest.status}${latest.error_code ? ` (${latest.error_code})` : ''}`,
    journeyCreated,
  }
}

/** List auto-initial coaches' clients still waiting on an initial plan (no delivery yet). */
export async function listPiyushPendingInitialPlanClients(
  admin: SupabaseClient,
  limit = 20
): Promise<OnboardingProfile[]> {
  const coachIds = [PIYUSH_COACH_ID, RAKSHIT_COACH_ID]
  // Over-fetch so we can filter Instant-only + already-delivered clients before applying limit.
  const fetchLimit = Math.max(limit * 5, 50)
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .in('coach_id', coachIds)
    .eq('onboarding_complete', true)
    .eq('plan_delivered', false)
    .order('created_at', { ascending: true })
    .limit(fetchLimit)

  if (error || !data?.length) return []

  const clientIds = data.map((row) => row.id)
  const { data: deliveredPlans, error: deliveredError } = await admin
    .from('plans')
    .select('client_id')
    .in('client_id', clientIds)
    .not('delivered_at', 'is', null)

  // Fail closed: if we cannot verify delivery history, return empty rather than over-queue.
  if (deliveredError) return []

  const hasDelivered = new Set((deliveredPlans ?? []).map((p) => p.client_id))

  const { data: purchaseRows } = await admin
    .from('purchases')
    .select('user_id, plan_slug, status')
    .in('user_id', clientIds)

  const hasDigital = new Set<string>()
  const hasCoaching = new Set<string>()
  for (const row of purchaseRows ?? []) {
    const status = (row.status || '').toLowerCase()
    const paid = status === 'paid' || status === 'captured' || status === 'completed' || !status
    if (!paid || !row.plan_slug) continue
    if (isDigitalPlanSlug(row.plan_slug)) hasDigital.add(row.user_id)
    else hasCoaching.add(row.user_id)
  }

  return (data as OnboardingProfile[])
    .filter(
      (row) =>
        !hasDelivered.has(row.id) &&
        shouldAutoJourneyAndDeliverInitialPlan(row.coach_id, row.created_at) &&
        // Instant-only buyers belong on digital fulfillment, not coaching auto-deliver.
        !(hasDigital.has(row.id) && !hasCoaching.has(row.id))
    )
    .slice(0, limit)
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
