import type { SupabaseClient } from '@supabase/supabase-js'
import { generatedCardioFormData, generatedDietFormData, generatedSupplementFormData, generatedWorkoutFormData } from '@/lib/ai/plan-format'
import { generatePlan } from '@/lib/ai/generate-plan'
import { selectKnowledgeCategories } from '@/lib/ai/prompt-builder'
import { logAiGeneration } from '@/lib/ai/trace-log'
import { buildActionCoachInstructions, mergePlanForms } from '@/lib/coach/ai-actions'
import { profileBlocksAiPlanWork } from '@/lib/complexity/input-guards'
import {
  canRetryInitialGeneration,
  INITIAL_GENERATION_CLAIM_STATUS,
  shouldStartInitialGeneration,
  STALE_GENERATION_MS,
  validateAuthoritativeOnboarding,
  validatePersistedOnboardingAnswers,
  type InitialPlanGenerationStatus,
} from '@/lib/initial-plan-generation-policy'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { persistAiPlanDraft } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile, PlanFormData } from '@/types/database'

export {
  canRetryInitialGeneration,
  INITIAL_GENERATION_CLAIM_STATUS,
  shouldStartInitialGeneration,
  STALE_GENERATION_MS,
  validateAuthoritativeOnboarding,
  validatePersistedOnboardingAnswers,
}
export type { InitialPlanGenerationStatus }

export type InitialPlanGenerationJob = {
  id: string
  client_id: string
  coach_id: string
  status: InitialPlanGenerationStatus
  attempt_count: number
  draft_plan_id: string | null
  error_code: string | null
  error_message: string | null
  queued_at: string
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
  updated_at: string
}

export async function enqueueInitialPlanGeneration(
  admin: SupabaseClient,
  profile: OnboardingProfile
): Promise<{ job: InitialPlanGenerationJob | null; error: string | null; deduplicated: boolean }> {
  const gateError = validateAuthoritativeOnboarding(profile)
  if (gateError) return { job: null, error: gateError, deduplicated: false }

  const { count: deliveredCount } = await admin
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', profile.id)
    .not('delivered_at', 'is', null)
  if ((deliveredCount ?? 0) > 0) {
    return {
      job: null,
      error: 'A delivered plan already exists. Use the explicit coach regeneration workflow.',
      deduplicated: false,
    }
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('initial_plan_generation_jobs')
    .insert({
      client_id: profile.id,
      coach_id: profile.coach_id,
      status: 'queued',
      queued_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (!error && data) {
    return { job: data as InitialPlanGenerationJob, error: null, deduplicated: false }
  }
  if (error?.code !== '23505') {
    return { job: null, error: error?.message ?? 'Could not queue plan generation.', deduplicated: false }
  }

  const { data: existing, error: existingError } = await admin
    .from('initial_plan_generation_jobs')
    .select('*')
    .eq('client_id', profile.id)
    .single()
  return {
    job: (existing as InitialPlanGenerationJob | null) ?? null,
    error: existingError?.message ?? null,
    deduplicated: true,
  }
}

async function loadProgressImages(
  admin: SupabaseClient,
  profile: OnboardingProfile
): Promise<{ mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }[]> {
  const paths = [
    profile.progress_photo_front,
    profile.progress_photo_side,
    profile.progress_photo_back,
  ].filter((path): path is string => Boolean(path))
  const images = []

  for (const path of paths) {
    const { data, error } = await admin.storage.from('onboarding-photos').download(path)
    if (error || !data) throw new Error('An uploaded onboarding photo could not be loaded.')
    const mediaType = data.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
      throw new Error('An uploaded onboarding photo has an unsupported format.')
    }
    images.push({
      mediaType,
      data: Buffer.from(await data.arrayBuffer()).toString('base64'),
    })
  }
  if (profile.gender !== 'female' && images.length !== 3) {
    throw new Error('All three onboarding photos are required.')
  }
  return images
}

function safeFailure(error: unknown): { code: string; message: string } {
  const text = error instanceof Error ? error.message : ''
  if (/not configured/i.test(text)) return { code: 'configuration', message: 'AI generation is not configured.' }
  if (/photo/i.test(text)) return { code: 'photo_unavailable', message: 'A required onboarding photo could not be processed.' }
  if (/validation|schema|json/i.test(text)) return { code: 'validation', message: 'The generated draft did not pass validation.' }
  return { code: 'generation_failed', message: 'AI draft generation failed. A coach can retry safely.' }
}

export async function processInitialPlanGeneration(jobId: string): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: claimed } = await admin
    .from('initial_plan_generation_jobs')
    .update({
      status: 'generating',
      started_at: now,
      failed_at: null,
      error_code: null,
      error_message: null,
      updated_at: now,
    })
    .eq('id', jobId)
    .eq('status', INITIAL_GENERATION_CLAIM_STATUS)
    .select('*')
    .maybeSingle()
  if (!claimed) return

  const job = claimed as InitialPlanGenerationJob
  try {
    const { data: profileData } = await admin.from('profiles').select('*').eq('id', job.client_id).single()
    if (!profileData) throw new Error('Authoritative onboarding profile is unavailable.')
    const profile = profileData as OnboardingProfile
    const gateError = validateAuthoritativeOnboarding(profile)
    if (gateError) throw new Error(`Onboarding validation failed: ${gateError}`)
    if (profileBlocksAiPlanWork(profile).blocked) {
      throw new Error('Onboarding validation requires coach review.')
    }

    const images = await loadProgressImages(admin, profile)
    const knowledgeRefs = selectKnowledgeCategories(profile)
    const runSection = async (
      actionId: 'initial_diet' | 'initial_workout' | 'initial_cardio' | 'initial_supplements'
    ) => {
      const startedAt = Date.now()
      const validationMode =
        actionId === 'initial_diet'
          ? 'nutrition_focus'
          : actionId === 'initial_workout'
            ? 'workout_focus'
            : actionId === 'initial_cardio'
              ? 'cardio_focus'
              : 'supplements_focus'
      try {
        const result = await generatePlan({
          profile,
          actionId,
          validationMode,
          // Skip heavy image payloads on cardio/supplements to stay under Vercel time limits.
          progressImages:
            actionId === 'initial_diet' || actionId === 'initial_workout' ? images : undefined,
          coachInstructions: buildActionCoachInstructions(actionId, {}),
        })
        await logAiGeneration({
          clientId: profile.id,
          coachId: job.coach_id,
          action: `onboarding_background_${actionId}`,
          model: result.model,
          promptVersion: result.promptVersion,
          latencyMs: Date.now() - startedAt,
          promptTokens: result.inputTokens,
          completionTokens: result.outputTokens,
          retryCount: result.retryCount,
          validationResult: 'pass',
          success: true,
          knowledgeRefs,
        })
        return result
      } catch (error) {
        const safe = safeFailure(error)
        await logAiGeneration({
          clientId: profile.id,
          coachId: job.coach_id,
          action: `onboarding_background_${actionId}`,
          model: null,
          latencyMs: Date.now() - startedAt,
          promptTokens: null,
          completionTokens: null,
          retryCount: 1,
          validationResult: safe.code,
          success: false,
          knowledgeRefs,
        })
        throw error
      }
    }

    const runOptionalSection = async (
      actionId: 'initial_cardio' | 'initial_supplements'
    ) => {
      try {
        return await runSection(actionId)
      } catch {
        // Soft-fail: diet + workout drafts must still be saved for coach review.
        return null
      }
    }

    const dietResult = await runSection('initial_diet')
    const workoutResult = await runSection('initial_workout')
    const cardioResult = await runOptionalSection('initial_cardio')
    const supplementResult = await runOptionalSection('initial_supplements')
    const diet = generatedDietFormData(dietResult.generatedPlan, profile.id)
    const workout = generatedWorkoutFormData(workoutResult.generatedPlan, profile.id)
    const cardio = cardioResult
      ? generatedCardioFormData(cardioResult.generatedPlan, profile.id)
      : null
    const supplements = supplementResult
      ? generatedSupplementFormData(supplementResult.generatedPlan, profile.id)
      : null
    const form: PlanFormData = mergePlanForms(diet, {
      workout_plan: workout.workout_plan,
      cardio_plan: cardio?.cardio_plan ?? '',
      supplement_plan: supplements?.supplement_plan ?? '',
      // Keep the client-facing coach note empty: delivery is blocked until a
      // coach reviews the draft and adds their own note.
      coach_notes: '',
      title: 'Complete Coaching Plan (Draft)',
    })

    const { count: deliveredCount } = await admin
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', profile.id)
      .not('delivered_at', 'is', null)
    if ((deliveredCount ?? 0) > 0) {
      throw new Error('A plan was delivered while generation was running.')
    }

    const persisted = await persistAiPlanDraft(admin, {
      clientId: profile.id,
      coachId: job.coach_id,
      form,
      title: 'AI Draft · Ready for coach note/review',
    })
    if (persisted.error || !persisted.data) throw new Error(persisted.error ?? 'Draft persistence failed.')

    const completedAt = new Date().toISOString()
    await admin
      .from('initial_plan_generation_jobs')
      .update({
        status: 'ready',
        draft_plan_id: persisted.data.id,
        completed_at: completedAt,
        failed_at: null,
        error_code: null,
        error_message: null,
        updated_at: completedAt,
      })
      .eq('id', job.id)
      .eq('status', 'generating')

    const { data: coach } = await admin.from('coaches').select('user_id').eq('id', job.coach_id).single()
    if (coach?.user_id) {
      await sendNotification({
        userId: coach.user_id,
        type: 'initial_plan_draft_ready',
        title: 'AI plan draft ready for review',
        body: 'Diet, workout, cardio, and supplement drafts are ready. Add your coach note, review, and explicitly deliver.',
        actionUrl: `/coach/plan/${persisted.data.id}`,
        metadata: { jobId: job.id, planId: persisted.data.id, clientId: profile.id },
      })
    }
  } catch (error) {
    const safe = safeFailure(error)
    const failedAt = new Date().toISOString()
    await admin
      .from('initial_plan_generation_jobs')
      .update({
        status: 'failed',
        error_code: safe.code,
        error_message: safe.message,
        failed_at: failedAt,
        updated_at: failedAt,
      })
      .eq('id', job.id)
      .eq('status', 'generating')

    const { data: coach } = await admin.from('coaches').select('user_id').eq('id', job.coach_id).single()
    if (coach?.user_id) {
      await sendNotification({
        userId: coach.user_id,
        type: 'initial_plan_generation_failed',
        title: 'AI plan draft needs a retry',
        body: safe.message,
        actionUrl: `/coach/client/${job.client_id}/generate-plan`,
        metadata: { jobId: job.id, clientId: job.client_id, errorCode: safe.code },
      })
    }
  }
}

export async function retryInitialPlanGeneration(
  admin: SupabaseClient,
  job: InitialPlanGenerationJob
): Promise<InitialPlanGenerationJob | null> {
  if (!canRetryInitialGeneration(job.status, job.started_at)) return null
  const now = new Date().toISOString()
  const { data } = await admin
    .from('initial_plan_generation_jobs')
    .update({
      status: 'queued',
      attempt_count: job.attempt_count + 1,
      queued_at: now,
      started_at: null,
      failed_at: null,
      error_code: null,
      error_message: null,
      updated_at: now,
    })
    .eq('id', job.id)
    .eq('status', job.status)
    .eq('updated_at', job.updated_at)
    .select('*')
    .maybeSingle()
  return (data as InitialPlanGenerationJob | null) ?? null
}
