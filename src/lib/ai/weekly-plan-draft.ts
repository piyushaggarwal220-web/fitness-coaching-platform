/**
 * Server-side weekly plan draft generation.
 * Triggered automatically after every weekly check-in submission.
 * Always regenerates diet + workout via AI, then stores an inactive draft.
 * Never auto-publishes and never posts the check-in into client chat.
 */
import { ensureClientCoachMessage } from '@/lib/ai/coach-message'
import { generatePlan } from '@/lib/ai/generate-plan'
import {
  logDraftWorkflow,
  persistDraftGenerationLog,
  persistDraftGenerationStarted,
  type DraftSectionUsage,
} from '@/lib/ai/draft-workflow-log'
import { MODELS } from '@/lib/ai/config'
import { generatedCardioFormData, generatedDietFormData, generatedSupplementFormData, generatedWorkoutFormData } from '@/lib/ai/plan-format'
import { buildActionCoachInstructions, mergePlanForms } from '@/lib/coach/ai-actions'
import { encodePlanMeta, planMatchesCheckin } from '@/lib/plan-metadata'
import { clientWantsSupplements, ensurePlanLifestyleSections } from '@/lib/plan-lifestyle'
import { getNextPlanVersion } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile, Plan, PlanFormData } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

function hasMeaningfulText(value: string | null | undefined): boolean {
  const text = value?.trim()
  if (!text) return false
  return !/^(none|n\/a|na|no|nil|-)$/i.test(text)
}

/**
 * Detect client-written requests to change food/training — progress_notes is required
 * every week, so we only treat it as a plan signal when change language appears.
 */
function clientRequestedPlanChange(checkin: Checkin): boolean {
  const CHANGE_SIGNAL =
    /\b(change|chang(?:e|ing)|swap|replace|remov(?:e|ing)|add(?:ing)?|increas(?:e|ing)|decreas(?:e|ing)|lower|rais(?:e|ing)|reduc(?:e|ing)|less|more|can'?t|cannot|struggl|hate|don'?t like|dislike|prefer|instead|switch|modif(?:y|ying)|updat(?:e|ing)|adjust|too (?:much|little|hard|easy|heavy|light)|want|need|please|request|stop|start|different|allerg|hurt|injur|pain|sick|digest|bloated|constipat|skip|miss(?:ed|ing)?|swap out|cut (?:out|back)|new (?:meal|exercise|workout|split)|vegetarian|non.?veg|egg|chicken|gym|home workout)\b/i

  const fields = [
    checkin.progress_notes,
    checkin.notes,
    checkin.questions_for_coach,
    checkin.adherence_struggles,
    checkin.pain_injuries,
    checkin.digestion,
    checkin.cardio_completed,
  ]

  return fields.some((text) => hasMeaningfulText(text) && CHANGE_SIGNAL.test(text!))
}

/** Stable weekly check-in: good scores, no pain/questions/struggles/change requests. */
function isStableWeeklyCheckin(checkin: Checkin): boolean {
  if (hasMeaningfulText(checkin.pain_injuries)) return false
  if (hasMeaningfulText(checkin.questions_for_coach)) return false
  if (hasMeaningfulText(checkin.adherence_struggles)) return false
  if (clientRequestedPlanChange(checkin)) return false

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

/** Skip cardio/supplement AI when active plan has them and check-in is stable. */
function shouldSkipSupportPlanRefresh(checkin: Checkin, active: Plan | null): boolean {
  const hasCardio = Boolean(active?.cardio_plan?.trim())
  const hasSupplements = Boolean(active?.supplement_plan?.trim())
  if (!hasCardio || !hasSupplements) return false
  return isStableWeeklyCheckin(checkin)
}

function pickPrimaryModel(sections: DraftSectionUsage[]): string | null {
  if (sections.length === 0) return null
  const sonnet = sections.find((s) => s.model.includes('sonnet') || s.model === MODELS.CLAUDE_SONNET)
  return sonnet?.model ?? sections[0]?.model ?? null
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
  coachNote?: string | null
}): Promise<{ planId: string | null; error: string | null; generationTimeMs: number }> {
  const trigger = input.trigger ?? 'auto'
  const started = Date.now()
  const eventStart = trigger === 'retry' ? 'retry_started' : 'draft_started'
  const coachNote = input.coachNote?.trim() || null

  logDraftWorkflow({
    event: eventStart,
    clientId: input.clientId,
    coachId: input.coachId,
    checkinId: input.checkinId,
    checkinWeek: input.coachingWeek,
    trigger,
  })

  // Durable in-flight marker for status polling (survives UI refresh / proxy timeouts).
  await persistDraftGenerationStarted({
    clientId: input.clientId,
    coachId: input.coachId,
    checkinId: input.checkinId,
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
    const profileTyped = profile as OnboardingProfile
    const sections: DraftSectionUsage[] = []
    // Diet + workout always regenerate from the weekly check-in. Support sections
    // (cardio/supplements) may still soft-keep when the week is stable.
    const skipSupportRefresh = shouldSkipSupportPlanRefresh(checkinTyped, active)

    const dietResult = await generatePlan({
      profile: profileTyped,
      latestCheckin: checkinTyped,
      actionId: 'review_update_diet',
      activePlan: active,
      validationMode: 'nutrition_focus',
      coachInstructions: buildActionCoachInstructions('review_update_diet', {
        activePlan: active,
        checkin: checkinTyped,
        coachNote,
      }),
    })
    sections.push({
      action: 'review_update_diet',
      model: dietResult.model,
      inputTokens: dietResult.inputTokens,
      outputTokens: dietResult.outputTokens,
    })
    const dietForm = generatedDietFormData(dietResult.generatedPlan, input.clientId)
    const updatedDietContext = buildUpdatedDietPlanForPrompt(
      active,
      dietForm.nutrition_plan,
      null,
      null
    )

    const workoutResult = await generatePlan({
      profile: profileTyped,
      latestCheckin: checkinTyped,
      actionId: 'review_update_workout',
      activePlan: active,
      updatedDietPlan: updatedDietContext,
      validationMode: 'workout_focus',
      coachInstructions: buildActionCoachInstructions('review_update_workout', {
        activePlan: active,
        checkin: checkinTyped,
        coachNote,
      }),
    })
    sections.push({
      action: 'review_update_workout',
      model: workoutResult.model,
      inputTokens: workoutResult.inputTokens,
      outputTokens: workoutResult.outputTokens,
    })
    const workoutForm = generatedWorkoutFormData(workoutResult.generatedPlan, input.clientId)

    // Persist a publishable core draft before optional cardio/supplement calls.
    // If the serverless isolate is killed mid-pipeline, coaches still get a usable draft.
    let cardioForm = {
      cardio_plan: active?.cardio_plan?.trim() || '',
    }
    let supplementForm = {
      supplement_plan: active?.supplement_plan?.trim() || '',
    }

    const buildMerged = (
      cardioPlan: string,
      supplementPlan: string
    ): PlanFormData =>
      mergePlanForms(
        {
          ...dietForm,
          client_id: input.clientId,
          title: `AI Draft · Week ${input.coachingWeek}`,
        },
        {
          workout_plan: workoutForm.workout_plan,
          cardio_plan: cardioPlan,
          supplement_plan: supplementPlan,
          coach_notes: [dietForm.coach_notes, workoutForm.coach_notes]
            .filter(Boolean)
            .join('\n\n'),
        }
      )

    let merged = buildMerged(cardioForm.cardio_plan, supplementForm.supplement_plan)
    const draftContext = buildDraftContextPlan(
      merged,
      input.clientId,
      input.coachId,
      input.coachingWeek,
      active
    )

    const clientMessage = await ensureClientCoachMessage({
      profile: profileTyped,
      checkin: checkinTyped,
      activePlan: active,
      draftPlan: draftContext,
      mergedNotes: merged.coach_notes,
      coachInstructions: coachNote,
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

    let draft = await upsertWeeklyPlanDraft({
      admin,
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
      coachingWeek: input.coachingWeek,
      merged,
      metaNotes,
      activePlan: active,
    })

    // Skip support regenerations when the active plan already has them and the check-in looks stable.
    if (!skipSupportRefresh) {
      try {
        const cardioResult = await generatePlan({
          profile: profileTyped,
          latestCheckin: checkinTyped,
          actionId: 'review_update_cardio',
          activePlan: active,
          updatedDietPlan: updatedDietContext,
          validationMode: 'cardio_focus',
          coachInstructions: buildActionCoachInstructions('review_update_cardio', {
            activePlan: active,
            checkin: checkinTyped,
            coachNote,
          }),
        })
        sections.push({
          action: 'review_update_cardio',
          model: cardioResult.model,
          inputTokens: cardioResult.inputTokens,
          outputTokens: cardioResult.outputTokens,
        })
        cardioForm = generatedCardioFormData(cardioResult.generatedPlan, input.clientId)
      } catch {
        // Keep existing cardio if the dedicated step fails.
      }

      if (clientWantsSupplements(profileTyped)) {
        try {
          const supplementResult = await generatePlan({
            profile: profileTyped,
            latestCheckin: checkinTyped,
            actionId: 'review_update_supplements',
            activePlan: active,
            updatedDietPlan: updatedDietContext,
            validationMode: 'supplements_focus',
            coachInstructions: buildActionCoachInstructions('review_update_supplements', {
              activePlan: active,
              checkin: checkinTyped,
              coachNote,
            }),
          })
          sections.push({
            action: 'review_update_supplements',
            model: supplementResult.model,
            inputTokens: supplementResult.inputTokens,
            outputTokens: supplementResult.outputTokens,
          })
          supplementForm = generatedSupplementFormData(supplementResult.generatedPlan, input.clientId)
        } catch {
          // Keep existing supplements if the dedicated step fails.
        }
      } else {
        supplementForm = { supplement_plan: '' }
      }

      merged = buildMerged(cardioForm.cardio_plan, supplementForm.supplement_plan)
      merged = ensurePlanLifestyleSections(merged, profileTyped)
      draft = await upsertWeeklyPlanDraft({
        admin,
        clientId: input.clientId,
        coachId: input.coachId,
        checkinId: input.checkinId,
        coachingWeek: input.coachingWeek,
        merged,
        metaNotes,
        activePlan: active,
      })
    } else {
      // Still guarantee Sleep / Water blocks even when cardio/supplements are soft-kept.
      merged = ensurePlanLifestyleSections(merged, profileTyped)
      draft = await upsertWeeklyPlanDraft({
        admin,
        clientId: input.clientId,
        coachId: input.coachId,
        checkinId: input.checkinId,
        coachingWeek: input.coachingWeek,
        merged,
        metaNotes,
        activePlan: active,
      })
    }

    const generationTimeMs = Date.now() - started
    const finishEvent = trigger === 'retry' ? 'retry_finished' : 'draft_finished'
    const promptTokens = sections.reduce((sum, s) => sum + s.inputTokens, 0)
    const completionTokens = sections.reduce((sum, s) => sum + s.outputTokens, 0)

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
      model: pickPrimaryModel(sections),
      promptTokens,
      completionTokens,
      skippedCore: false,
      skippedSupport: skipSupportRefresh,
      sections,
    })

    return { planId: draft.id, error: null, generationTimeMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft generation failed'
    const generationTimeMs = Date.now() - started

    // If a core draft was already saved before a later failure, treat as success for the coach.
    try {
      const admin = createAdminClient()
      const existing = await findAiDraftForCheckin(admin, input.clientId, input.checkinId)
      if (existing?.nutrition_plan?.trim() || existing?.workout_plan?.trim()) {
        logDraftWorkflow({
          event: trigger === 'retry' ? 'retry_finished' : 'draft_finished',
          clientId: input.clientId,
          coachId: input.coachId,
          checkinId: input.checkinId,
          checkinWeek: input.coachingWeek,
          planId: existing.id,
          planVersion: existing.version,
          generationTimeMs,
          trigger,
          error: `Completed with partial draft after: ${message}`,
        })
        await persistDraftGenerationLog({
          clientId: input.clientId,
          coachId: input.coachId,
          checkinId: input.checkinId,
          success: true,
          latencyMs: generationTimeMs,
          trigger,
          planVersion: `v${existing.version}`,
          error: `partial_ok: ${message}`,
        })
        return { planId: existing.id, error: null, generationTimeMs }
      }
    } catch {
      // Fall through to failure path.
    }

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
