/**
 * Server-side weekly plan draft generation.
 * Coach Generate/Retry (and ops backfill) call this with trigger retry/manual.
 * Auto trigger is a no-op for manual-delivery coaches.
 * Never auto-publishes and never posts the check-in into client chat.
 */
import { ensureClientCoachMessage } from '@/lib/ai/coach-message'
import { GeneratePlanError, generatePlan } from '@/lib/ai/generate-plan'
import { loadClientJourneySnapshot } from '@/lib/ai/client-journey'
import { prepareNutritionPlanForSave } from '@/lib/ai/nutrition-macro-sync'
import {
  logDraftWorkflow,
  persistDraftGenerationLog,
  persistDraftGenerationStarted,
  type DraftSectionUsage,
} from '@/lib/ai/draft-workflow-log'
import { MODELS } from '@/lib/ai/config'
import { isOpenAiBillingError } from '@/lib/ai/openai-quota'
import {
  openAiBillingHoldActive,
  openAiBillingHoldUntil,
  recordOpenAiBillingFailure,
} from '@/lib/ai/openai-quota-guard'
import { generatedCardioFormData, generatedDietFormData, generatedSupplementFormData, generatedWorkoutFormData } from '@/lib/ai/plan-format'
import { buildActionCoachInstructions, mergePlanForms } from '@/lib/coach/ai-actions'
import { applyLifestyleGuidance } from '@/lib/lifestyle-guidance'
import { encodePlanMeta, planMatchesCheckin } from '@/lib/plan-metadata'
import { getNextPlanVersion } from '@/lib/plans'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { createAdminClient } from '@/lib/supabase/admin'
import { coachRequiresManualPlanDelivery } from '@/lib/coach-delivery-policy'
import {
  fetchCapturedPlanSlug,
  offersSundayPlanChoice,
  shouldGenerateChosenWeeklyPlan,
} from '@/lib/plan-update-cadence'
import { loadSameWeekMidWeekCheckin } from '@/lib/ai/same-week-midweek'
import type { Checkin, OnboardingProfile, Plan, PlanFormData } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

function pickPrimaryModel(sections: DraftSectionUsage[]): string | null {
  if (sections.length === 0) return null
  const terra = sections.find((s) => s.model.includes('terra') || s.model === MODELS.GPT_TERRA)
  if (terra) return terra.model
  const luna = sections.find((s) => s.model.includes('luna') || s.model === MODELS.GPT_LUNA)
  return luna?.model ?? sections[0]?.model ?? null
}

function dietFormFromActive(clientId: string, active: Plan): PlanFormData {
  return {
    client_id: clientId,
    title: 'Diet Plan (Draft)',
    phase: active.phase ?? '',
    workout_plan: '',
    nutrition_plan: prepareNutritionPlanForSave(active.nutrition_plan) || '',
    cardio_plan: '',
    supplement_plan: '',
    coach_notes: '',
  }
}

function workoutFormFromActive(clientId: string, active: Plan): PlanFormData {
  return {
    client_id: clientId,
    title: 'Workout Plan (Draft)',
    phase: active.phase ?? '',
    workout_plan: active.workout_plan?.trim() || '',
    nutrition_plan: '',
    cardio_plan: '',
    supplement_plan: '',
    coach_notes: '',
  }
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
  profile: OnboardingProfile
}): Promise<{ id: string; version: number }> {
  const now = new Date().toISOString()
  const existing = await findAiDraftForCheckin(input.admin, input.clientId, input.checkinId)
  const lifestyle = applyLifestyleGuidance(
    {
      cardio_plan: input.merged.cardio_plan,
      coach_notes: input.metaNotes,
      nutrition_plan: input.merged.nutrition_plan,
      workout_plan: input.merged.workout_plan,
    },
    input.profile
  )

  const fields = {
    title: input.merged.title,
    phase: input.merged.phase?.trim() || input.activePlan?.phase || null,
    workout_plan: input.merged.workout_plan?.trim() || null,
    nutrition_plan: input.merged.nutrition_plan?.trim() || null,
    cardio_plan: lifestyle.cardio_plan,
    supplement_plan: input.merged.supplement_plan?.trim() || null,
    coach_notes: lifestyle.coach_notes || input.metaNotes,
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

async function notifyCoachWeeklyDraftReady(input: {
  coachId: string
  clientId: string
  checkinId: string
  coachingWeek: number
  planId: string
  clientName?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const { data: coach } = await admin.from('coaches').select('user_id').eq('id', input.coachId).maybeSingle()
  if (!coach?.user_id) return

  let clientName = input.clientName?.trim() || null
  if (!clientName) {
    const { data: profile } = await admin
      .from('profiles')
      .select('name, email')
      .eq('id', input.clientId)
      .maybeSingle()
    clientName = profile?.name?.trim() || profile?.email || 'Client'
  }

  const weekLabel = input.coachingWeek > 0 ? `Week ${input.coachingWeek}` : 'Weekly'
  await sendNotification({
    userId: coach.user_id,
    type: 'weekly_plan_draft_ready',
    title: 'Weekly AI draft ready for review',
    body: `${clientName}: ${weekLabel} draft is ready. Review and publish when you are ready.`,
    actionUrl: `/coach/plan/${input.planId}`,
    metadata: {
      checkinId: input.checkinId,
      planId: input.planId,
      clientId: input.clientId,
      coachingWeek: input.coachingWeek,
    },
  })
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
  const admin = createAdminClient()

  if (openAiBillingHoldActive() || (await openAiBillingHoldUntil())) {
    return { planId: null, error: 'openai_billing_hold', generationTimeMs: Date.now() - started }
  }

  if (trigger === 'auto') {
    if (coachRequiresManualPlanDelivery(input.coachId)) {
      return { planId: null, error: null, generationTimeMs: Date.now() - started }
    }
    const planSlug = await fetchCapturedPlanSlug(input.clientId)
    const { data: choiceRow } = await admin
      .from('checkins')
      .select('wants_plan_update')
      .eq('id', input.checkinId)
      .maybeSingle()
    if (
      !shouldGenerateChosenWeeklyPlan({
        planSlug,
        coachingWeek: input.coachingWeek,
        wantsPlanUpdate: choiceRow?.wants_plan_update,
      })
    ) {
      logDraftWorkflow({
        event: 'draft_finished',
        clientId: input.clientId,
        coachId: input.coachId,
        checkinId: input.checkinId,
        checkinWeek: input.coachingWeek,
        trigger,
        generationTimeMs: Date.now() - started,
      })
      return { planId: null, error: null, generationTimeMs: Date.now() - started }
    }
  }

  if (trigger === 'retry') {
    const planSlug = await fetchCapturedPlanSlug(input.clientId)
    if (offersSundayPlanChoice(planSlug)) {
      const { data: choiceRow } = await admin
        .from('checkins')
        .select('wants_plan_update')
        .eq('id', input.checkinId)
        .maybeSingle()
      if (choiceRow?.wants_plan_update === false) {
        logDraftWorkflow({
          event: 'draft_finished',
          clientId: input.clientId,
          coachId: input.coachId,
          checkinId: input.checkinId,
          checkinWeek: input.coachingWeek,
          trigger,
          generationTimeMs: Date.now() - started,
        })
        return { planId: null, error: null, generationTimeMs: Date.now() - started }
      }
    }
  }

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
    const sameWeekMidWeek = await loadSameWeekMidWeekCheckin(admin, checkinTyped)
    const clientJourney = await loadClientJourneySnapshot(admin, {
      clientId: input.clientId,
      profile: profileTyped,
      currentCheckin: checkinTyped,
    })
    const sections: DraftSectionUsage[] = []

    let dietForm: PlanFormData
    let updatedDietContext: Plan | null

    try {
      const dietResult = await generatePlan({
        profile: profileTyped,
        latestCheckin: checkinTyped,
        sameWeekMidWeekCheckin: sameWeekMidWeek,
        actionId: 'review_update_diet',
        activePlan: active,
        validationMode: 'nutrition_focus',
        clientJourney,
        coachInstructions: buildActionCoachInstructions('review_update_diet', {
          activePlan: active,
          checkin: checkinTyped,
          midWeekCheckin: sameWeekMidWeek,
          coachNote,
        }),
      })
      sections.push({
        action: 'review_update_diet',
        model: dietResult.model,
        inputTokens: dietResult.inputTokens,
        outputTokens: dietResult.outputTokens,
      })
      dietForm = generatedDietFormData(dietResult.generatedPlan, input.clientId)
      updatedDietContext = buildUpdatedDietPlanForPrompt(
        active,
        dietForm.nutrition_plan,
        null,
        null
      )
    } catch (error) {
      if (!active?.nutrition_plan?.trim()) throw error
      const message = error instanceof Error ? error.message : 'diet rewrite failed'
      console.warn('[weekly-plan] kept the current diet after a failed rewrite', message.slice(0, 240))
      dietForm = dietFormFromActive(input.clientId, active)
      updatedDietContext = buildUpdatedDietPlanForPrompt(
        active,
        dietForm.nutrition_plan,
        null,
        null
      )
    }

    let workoutForm: PlanFormData
    try {
      const workoutResult = await generatePlan({
        profile: profileTyped,
        latestCheckin: checkinTyped,
        sameWeekMidWeekCheckin: sameWeekMidWeek,
        actionId: 'review_update_workout',
        activePlan: active,
        updatedDietPlan: updatedDietContext,
        validationMode: 'workout_focus',
        clientJourney,
        coachInstructions: buildActionCoachInstructions('review_update_workout', {
          activePlan: active,
          checkin: checkinTyped,
          midWeekCheckin: sameWeekMidWeek,
          coachNote,
        }),
      })
      sections.push({
        action: 'review_update_workout',
        model: workoutResult.model,
        inputTokens: workoutResult.inputTokens,
        outputTokens: workoutResult.outputTokens,
      })
      workoutForm = generatedWorkoutFormData(workoutResult.generatedPlan, input.clientId)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const structureFailed =
        error instanceof GeneratePlanError &&
        /back-to-back|Arm work is too low|Leg work is too low|working exercise/i.test(message)
      if (!structureFailed || !active?.workout_plan?.trim()) throw error
      console.warn('[weekly-plan] kept the current workout after a broken rewrite', message.slice(0, 240))
      workoutForm = workoutFormFromActive(input.clientId, active)
    }

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
          coach_notes: [dietForm.coach_notes, workoutForm.coach_notes].filter(Boolean).join('\n\n'),
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

    const lifestyle = applyLifestyleGuidance(
      {
        cardio_plan: merged.cardio_plan,
        coach_notes: clientMessage,
        nutrition_plan: merged.nutrition_plan,
        workout_plan: merged.workout_plan,
      },
      profileTyped
    )
    merged = { ...merged, cardio_plan: lifestyle.cardio_plan }
    const metaNotes = encodePlanMeta(
      {
        checkinId: input.checkinId,
        week: input.coachingWeek,
        generatedBy: 'ai',
        source: `Week ${input.coachingWeek} Check-in`,
      },
      lifestyle.coach_notes
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
      profile: profileTyped,
    })

    try {
      const cardioResult = await generatePlan({
        profile: profileTyped,
        latestCheckin: checkinTyped,
        sameWeekMidWeekCheckin: sameWeekMidWeek,
        actionId: 'review_update_cardio',
        activePlan: active,
        updatedDietPlan: updatedDietContext,
        validationMode: 'cardio_focus',
        clientJourney,
        coachInstructions: buildActionCoachInstructions('review_update_cardio', {
          activePlan: active,
          checkin: checkinTyped,
          midWeekCheckin: sameWeekMidWeek,
          coachNote,
        }),
      })
      sections.push({
        action: 'review_update_cardio',
        model: cardioResult.model,
        inputTokens: cardioResult.inputTokens,
        outputTokens: cardioResult.outputTokens,
      })
      cardioForm = generatedCardioFormData(
        cardioResult.generatedPlan,
        input.clientId,
        active?.cardio_plan
      )
    } catch {
      // Keep existing cardio if the dedicated step fails.
    }

      try {
        const supplementResult = await generatePlan({
          profile: profileTyped,
          latestCheckin: checkinTyped,
          sameWeekMidWeekCheckin: sameWeekMidWeek,
          actionId: 'review_update_supplements',
          activePlan: active,
          updatedDietPlan: updatedDietContext,
          validationMode: 'supplements_focus',
          clientJourney,
          coachInstructions: buildActionCoachInstructions('review_update_supplements', {
            activePlan: active,
            checkin: checkinTyped,
            midWeekCheckin: sameWeekMidWeek,
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

      merged = buildMerged(cardioForm.cardio_plan, supplementForm.supplement_plan)
      draft = await upsertWeeklyPlanDraft({
        admin,
        clientId: input.clientId,
        coachId: input.coachId,
        checkinId: input.checkinId,
        coachingWeek: input.coachingWeek,
        merged,
        metaNotes,
        activePlan: active,
        profile: profileTyped,
      })

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
      skippedSupport: false,
      sections,
    })

    if (coachRequiresManualPlanDelivery(input.coachId)) {
      await notifyCoachWeeklyDraftReady({
        coachId: input.coachId,
        clientId: input.clientId,
        checkinId: input.checkinId,
        coachingWeek: input.coachingWeek,
        planId: draft.id,
        clientName: (profile as OnboardingProfile).name,
      }).catch(() => undefined)
    }

    return { planId: draft.id, error: null, generationTimeMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft generation failed'
    const generationTimeMs = Date.now() - started
    if (isOpenAiBillingError(message)) {
      await recordOpenAiBillingFailure(message).catch((recordErr) =>
        console.error('[weekly-plan-draft] billing hold record failed:', recordErr)
      )
    }

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
        if (coachRequiresManualPlanDelivery(input.coachId)) {
          await notifyCoachWeeklyDraftReady({
            coachId: input.coachId,
            clientId: input.clientId,
            checkinId: input.checkinId,
            coachingWeek: input.coachingWeek,
            planId: existing.id,
          }).catch(() => undefined)
        }
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
