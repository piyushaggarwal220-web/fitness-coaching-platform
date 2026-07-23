/**
 * Server-side weekly plan draft generation.
 * Triggered automatically after weekly check-in submission.
 * Stores inactive draft plans — never auto-publishes.
 */
import { ensureClientCoachMessage } from '@/lib/ai/coach-message'
import { generatePlan } from '@/lib/ai/generate-plan'
import {
  logDraftWorkflow,
  persistDraftGenerationLog,
} from '@/lib/ai/draft-workflow-log'
import { generatedCardioFormData, generatedDietFormData, generatedSupplementFormData, generatedWorkoutFormData } from '@/lib/ai/plan-format'
import { buildActionCoachInstructions, mergePlanForms } from '@/lib/coach/ai-actions'
import { encodePlanMeta, planMatchesCheckin } from '@/lib/plan-metadata'
import { getNextPlanVersion } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile, Plan, PlanFormData } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Skip cardio/supplement AI calls when existing plans look fine and check-in is stable. */
function shouldSkipSupportPlanRefresh(checkin: Checkin, active: Plan | null): boolean {
  const hasCardio = Boolean(active?.cardio_plan?.trim())
  const hasSupplements = Boolean(active?.supplement_plan?.trim())
  if (!hasCardio || !hasSupplements) return false

  const pain = checkin.pain_injuries?.trim()
  if (pain && !/^(none|n\/a|na|no|nil|-)$/i.test(pain)) return false

  const scoreOk = (value: number | null | undefined, min: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value >= min : true
  const stressOk =
    typeof checkin.stress_level === 'number' && Number.isFinite(checkin.stress_level)
      ? checkin.stress_level <= 6
      : true

  return (
    scoreOk(checkin.energy_level, 6) &&
    scoreOk(checkin.sleep_quality, 6) &&
    scoreOk(checkin.diet_adherence, 7) &&
    scoreOk(checkin.workout_adherence, 7) &&
    stressOk
  )
}

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

export async function findAiDraftForCheckin(
  supabase: SupabaseClient,
  clientId: string,
  checkinId: string
): Promise<Plan | null> {
  const { data: drafts } = await supabase
    .from('plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', false)
    .like('title', 'AI Draft%')
    .order('updated_at', { ascending: false })
    .limit(20)

  const plans = (drafts ?? []) as Plan[]
  return plans.find((plan) => planMatchesCheckin(plan, checkinId)) ?? null
}

function buildDraftContextPlan(
  merged: PlanFormData,
  clientId: string,
  coachId: string,
  coachingWeek: number,
  activePlan: Plan | null
): Plan {
  const now = new Date().toISOString()
  return {
    id: 'draft-context',
    client_id: clientId,
    coach_id: coachId,
    title: merged.title,
    phase: merged.phase?.trim() || activePlan?.phase || null,
    workout_plan: merged.workout_plan?.trim() || null,
    nutrition_plan: merged.nutrition_plan?.trim() || null,
    cardio_plan: merged.cardio_plan?.trim() || null,
    supplement_plan: merged.supplement_plan?.trim() || null,
    coach_notes: merged.coach_notes?.trim() || null,
    version: activePlan?.version ?? 0,
    active: false,
    delivered_at: null,
    updated_at: now,
    created_at: now,
  }
}

async function upsertWeeklyPlanDraft(input: {
  admin: SupabaseClient
  clientId: string
  coachId: string
  checkinId: string
  coachingWeek: number
  merged: PlanFormData
  metaNotes: string | null
  activePlan: Plan | null
}): Promise<{ id: string; version: number }> {
  const now = new Date().toISOString()
  const existing = await findAiDraftForCheckin(input.admin, input.clientId, input.checkinId)

  const fields = {
    title: input.merged.title,
    phase: input.merged.phase?.trim() || input.activePlan?.phase || null,
    workout_plan: input.merged.workout_plan?.trim() || null,
    nutrition_plan: input.merged.nutrition_plan?.trim() || null,
    cardio_plan: input.merged.cardio_plan?.trim() || null,
    supplement_plan: input.merged.supplement_plan?.trim() || null,
    coach_notes: input.metaNotes,
    updated_at: now,
  }

  if (existing) {
    const { data: draft, error: updateError } = await input.admin
      .from('plans')
      .update(fields)
      .eq('id', existing.id)
      .select('id, version')
      .single()

    if (updateError || !draft) {
      throw new Error(updateError?.message ?? 'Failed to update draft plan')
    }

    return { id: draft.id as string, version: draft.version as number }
  }

  const version = await getNextPlanVersion(input.admin, input.clientId)
  const { data: draft, error: insertError } = await input.admin
    .from('plans')
    .insert({
      client_id: input.clientId,
      coach_id: input.coachId,
      ...fields,
      version,
      active: false,
      created_at: now,
    })
    .select('id, version')
    .single()

  if (insertError || !draft) {
    throw new Error(insertError?.message ?? 'Failed to save draft plan')
  }

  return { id: draft.id as string, version: draft.version as number }
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

    const active = (activePlan as Plan | null) ?? null
    const checkinTyped = checkin as Checkin

    const dietResult = await generatePlan({
      profile: profile as OnboardingProfile,
      latestCheckin: checkinTyped,
      actionId: 'review_update_diet',
      activePlan: active,
      validationMode: 'nutrition_focus',
      coachInstructions: buildActionCoachInstructions('review_update_diet', {
        activePlan: active,
        checkin: checkinTyped,
      }),
    })

    const dietForm = generatedDietFormData(dietResult.generatedPlan, input.clientId)
    const updatedDietContext = buildUpdatedDietPlanForPrompt(
      active,
      dietForm.nutrition_plan,
      null,
      null
    )

    const workoutResult = await generatePlan({
      profile: profile as OnboardingProfile,
      latestCheckin: checkinTyped,
      actionId: 'review_update_workout',
      activePlan: active,
      updatedDietPlan: updatedDietContext,
      validationMode: 'workout_focus',
      coachInstructions: buildActionCoachInstructions('review_update_workout', {
        activePlan: active,
        checkin: checkinTyped,
      }),
    })

    let cardioForm = {
      cardio_plan: active?.cardio_plan?.trim() || '',
    }
    // Skip support regenerations when the active plan already has them and the check-in looks stable.
    // Diet + workout still regenerate every week.
    const skipSupportRefresh = shouldSkipSupportPlanRefresh(checkinTyped, active)
    if (!skipSupportRefresh) {
      try {
        const cardioResult = await generatePlan({
          profile: profile as OnboardingProfile,
          latestCheckin: checkinTyped,
          actionId: 'review_update_cardio',
          activePlan: active,
          updatedDietPlan: updatedDietContext,
          validationMode: 'cardio_focus',
          coachInstructions: buildActionCoachInstructions('review_update_cardio', {
            activePlan: active,
            checkin: checkinTyped,
          }),
        })
        cardioForm = generatedCardioFormData(cardioResult.generatedPlan, input.clientId)
      } catch {
        // Keep existing cardio if the dedicated step fails.
      }
    }

    let supplementForm = {
      supplement_plan: active?.supplement_plan?.trim() || '',
    }
    if (!skipSupportRefresh) {
      try {
        const supplementResult = await generatePlan({
          profile: profile as OnboardingProfile,
          latestCheckin: checkinTyped,
          actionId: 'review_update_supplements',
          activePlan: active,
          updatedDietPlan: updatedDietContext,
          validationMode: 'supplements_focus',
          coachInstructions: buildActionCoachInstructions('review_update_supplements', {
            activePlan: active,
            checkin: checkinTyped,
          }),
        })
        supplementForm = generatedSupplementFormData(supplementResult.generatedPlan, input.clientId)
      } catch {
        // Keep existing supplements if the dedicated step fails.
      }
    }

    const workoutForm = generatedWorkoutFormData(workoutResult.generatedPlan, input.clientId)
    const merged = mergePlanForms(
      {
        ...dietForm,
        client_id: input.clientId,
        title: `AI Draft · Week ${input.coachingWeek}`,
      },
      {
        workout_plan: workoutForm.workout_plan,
        cardio_plan: cardioForm.cardio_plan,
        supplement_plan: supplementForm.supplement_plan,
        coach_notes: [dietForm.coach_notes, workoutForm.coach_notes].filter(Boolean).join('\n\n'),
      }
    )

    const draftContext = buildDraftContextPlan(
      merged,
      input.clientId,
      input.coachId,
      input.coachingWeek,
      (activePlan as Plan | null) ?? null
    )

    const clientMessage = await ensureClientCoachMessage({
      profile: profile as OnboardingProfile,
      checkin: checkin as Checkin,
      activePlan: (activePlan as Plan | null) ?? null,
      draftPlan: draftContext,
      mergedNotes: merged.coach_notes,
    })

    const metaNotes = encodePlanMeta(
      {
        checkinId: input.checkinId,
        week: input.coachingWeek,
        generatedBy: 'ai',
        source: `Week ${input.coachingWeek} Check-in`,
      },
      clientMessage
    )

    const draft = await upsertWeeklyPlanDraft({
      admin,
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
      coachingWeek: input.coachingWeek,
      merged,
      metaNotes,
      activePlan: (activePlan as Plan | null) ?? null,
    })

    const generationTimeMs = Date.now() - started
    const finishEvent = trigger === 'retry' ? 'retry_finished' : 'draft_finished'

    logDraftWorkflow({
      event: finishEvent,
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
      checkinWeek: input.coachingWeek,
      planId: draft.id,
      planVersion: draft.version,
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

    return { planId: draft.id, error: null, generationTimeMs }
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

/**
 * Strictly resolves the AI draft linked to this check-in.
 * No latest-draft fallback: "Ready" must never be faked by a stale draft
 * from a previous week's check-in.
 */
export async function loadLatestAiDraftForClient(
  clientId: string,
  checkinId: string
): Promise<Plan | null> {
  const admin = createAdminClient()
  return findAiDraftForCheckin(admin, clientId, checkinId)
}
