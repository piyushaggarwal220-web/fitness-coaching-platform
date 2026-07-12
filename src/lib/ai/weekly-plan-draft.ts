/**
 * Server-side weekly plan draft generation.
 * Triggered automatically after weekly check-in submission.
 * Stores inactive draft plans — never auto-publishes.
 */
import { generatePlan } from '@/lib/ai/generate-plan'
import {
  logDraftWorkflow,
  persistDraftGenerationLog,
} from '@/lib/ai/draft-workflow-log'
import { generatedDietFormData, generatedWorkoutFormData } from '@/lib/ai/plan-format'
import { mergePlanForms } from '@/lib/coach/ai-actions'
import { encodePlanMeta } from '@/lib/plan-metadata'
import { getNextPlanVersion } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile, Plan } from '@/types/database'

function buildUpdatedDietPlanForPrompt(
  activePlan: Plan | null,
  draftNutrition: string,
  draftCardio: string | null,
  draftSupplements: string | null
): Plan | null {
  if (!activePlan && !draftNutrition.trim()) return null
  const now = new Date().toISOString()
  const base = activePlan ?? {
    id: 'draft-context',
    client_id: '',
    coach_id: '',
    title: 'Updated diet draft',
    phase: null,
    workout_plan: null,
    nutrition_plan: null,
    cardio_plan: null,
    supplement_plan: null,
    coach_notes: null,
    version: 0,
    active: false,
    delivered_at: null,
    updated_at: now,
    created_at: now,
  }

  return {
    ...base,
    nutrition_plan: draftNutrition,
    cardio_plan: draftCardio,
    supplement_plan: draftSupplements,
    workout_plan: base.workout_plan,
  }
}

export async function generateWeeklyPlanDraft(input: {
  clientId: string
  coachId: string
  checkinId: string
  coachingWeek: number
  trigger?: 'auto' | 'manual' | 'retry'
}): Promise<{ planId: string | null; error: string | null; generationTimeMs: number }> {
  const trigger = input.trigger ?? 'auto'
  const started = Date.now()
  const eventStart = trigger === 'retry' ? 'retry_started' : 'draft_started'

  logDraftWorkflow({
    event: eventStart,
    clientId: input.clientId,
    coachId: input.coachId,
    checkinId: input.checkinId,
    checkinWeek: input.coachingWeek,
    trigger,
  })

  try {
    const admin = createAdminClient()

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('id', input.clientId)
      .single()

    if (profileError || !profile) {
      throw new Error(profileError?.message ?? 'Profile not found')
    }

    const { data: checkin, error: checkinError } = await admin
      .from('checkins')
      .select('*')
      .eq('id', input.checkinId)
      .single()

    if (checkinError || !checkin) {
      throw new Error(checkinError?.message ?? 'Check-in not found')
    }

    const { data: activePlan } = await admin
      .from('plans')
      .select('*')
      .eq('client_id', input.clientId)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const dietResult = await generatePlan({
      profile: profile as OnboardingProfile,
      latestCheckin: checkin as Checkin,
      actionId: 'review_update_diet',
      activePlan: (activePlan as Plan | null) ?? null,
      validationMode: 'nutrition_focus',
    })

    const dietForm = generatedDietFormData(dietResult.generatedPlan, input.clientId)
    const updatedDietContext = buildUpdatedDietPlanForPrompt(
      (activePlan as Plan | null) ?? null,
      dietForm.nutrition_plan,
      dietForm.cardio_plan || null,
      dietForm.supplement_plan || null
    )

    const workoutResult = await generatePlan({
      profile: profile as OnboardingProfile,
      latestCheckin: checkin as Checkin,
      actionId: 'review_update_workout',
      activePlan: (activePlan as Plan | null) ?? null,
      updatedDietPlan: updatedDietContext,
      validationMode: 'workout_focus',
    })

    const workoutForm = generatedWorkoutFormData(workoutResult.generatedPlan, input.clientId)
    const merged = mergePlanForms(
      {
        ...dietForm,
        client_id: input.clientId,
        title: `AI Draft · Week ${input.coachingWeek}`,
      },
      {
        workout_plan: workoutForm.workout_plan,
        cardio_plan: workoutForm.cardio_plan || dietForm.cardio_plan,
        coach_notes: [dietForm.coach_notes, workoutForm.coach_notes].filter(Boolean).join('\n\n'),
      }
    )

    const metaNotes = encodePlanMeta(
      {
        checkinId: input.checkinId,
        week: input.coachingWeek,
        generatedBy: 'ai',
        source: `Week ${input.coachingWeek} Check-in`,
      },
      merged.coach_notes
    )

    const version = await getNextPlanVersion(admin, input.clientId)
    const now = new Date().toISOString()

    const { data: draft, error: insertError } = await admin
      .from('plans')
      .insert({
        client_id: input.clientId,
        coach_id: input.coachId,
        title: merged.title,
        phase: merged.phase?.trim() || (activePlan as Plan | null)?.phase || null,
        workout_plan: merged.workout_plan?.trim() || null,
        nutrition_plan: merged.nutrition_plan?.trim() || null,
        cardio_plan: merged.cardio_plan?.trim() || null,
        supplement_plan: merged.supplement_plan?.trim() || null,
        coach_notes: metaNotes,
        version,
        active: false,
        created_at: now,
        updated_at: now,
      })
      .select('id, version')
      .single()

    if (insertError || !draft) {
      throw new Error(insertError?.message ?? 'Failed to save draft plan')
    }

    const generationTimeMs = Date.now() - started
    const finishEvent = trigger === 'retry' ? 'retry_finished' : 'draft_finished'

    logDraftWorkflow({
      event: finishEvent,
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
      checkinWeek: input.coachingWeek,
      planId: draft.id as string,
      planVersion: draft.version as number,
      generationTimeMs,
      trigger,
    })

    await persistDraftGenerationLog({
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
      success: true,
      latencyMs: generationTimeMs,
      trigger,
      planVersion: `v${draft.version}`,
    })

    return { planId: draft.id as string, error: null, generationTimeMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft generation failed'
    const generationTimeMs = Date.now() - started

    logDraftWorkflow({
      event: 'draft_failed',
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
      checkinWeek: input.coachingWeek,
      generationTimeMs,
      error: message,
      trigger,
    })

    await persistDraftGenerationLog({
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
      success: false,
      latencyMs: generationTimeMs,
      error: message,
      trigger,
    })

    return { planId: null, error: message, generationTimeMs }
  }
}

/** @deprecated Use generateWeeklyPlanDraft */
export async function autoGenerateWeeklyPlanDraft(input: {
  clientId: string
  coachId: string
  checkinId: string
  coachingWeek: number
}): Promise<{ planId: string | null; error: string | null }> {
  const result = await generateWeeklyPlanDraft({ ...input, trigger: 'auto' })
  return { planId: result.planId, error: result.error }
}

export async function loadLatestAiDraftForClient(
  clientId: string,
  checkinId?: string
): Promise<Plan | null> {
  const admin = createAdminClient()
  const { data: drafts } = await admin
    .from('plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', false)
    .like('title', 'AI Draft%')
    .order('created_at', { ascending: false })
    .limit(10)

  const plans = (drafts ?? []) as Plan[]
  if (checkinId) {
    const linked = plans.find((p) => p.coach_notes?.includes(checkinId))
    if (linked) return linked
  }
  return plans[0] ?? null
}
