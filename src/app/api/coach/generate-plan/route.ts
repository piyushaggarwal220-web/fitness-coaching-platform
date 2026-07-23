import { NextResponse } from 'next/server'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { getLastCompileReport } from '@/lib/ai/prompt-cache'
import {
  generatedCardioFormData,
  generatedDietFormData,
  generatedPlanToFormData,
  generatedSupplementFormData,
  generatedWorkoutFormData,
} from '@/lib/ai/plan-format'
import { generatePlan, GeneratePlanError, type PlanValidationMode } from '@/lib/ai/generate-plan'
import { selectKnowledgeCategories } from '@/lib/ai/prompt-builder'
import { logAiGeneration } from '@/lib/ai/trace-log'
import {
  buildActionCoachInstructions,
  buildAiReasoningDisplay,
  getCoachAiAction,
  isCoachAiActionId,
  mergePlanForms,
  type CoachAiActionId,
} from '@/lib/coach/ai-actions'
import { createClient } from '@/lib/supabase/server'
import { planToForm } from '@/lib/plans'
import type { Checkin, OnboardingProfile, Plan, PlanFormData } from '@/types/database'

/** Long sequential Claude calls for diet/workout. */
export const maxDuration = 300

type GeneratePlanRequestBody = {
  clientId?: string
  action?: string
  coachNote?: string
  coachInstructions?: string
  checkinId?: string
  draftPlanContext?: Partial<PlanFormData> | null
}

function actionValidationMode(
  actionId: CoachAiActionId,
  isLegacyFullPlan: boolean
): PlanValidationMode {
  if (isLegacyFullPlan) return 'full'
  switch (actionId) {
    case 'initial_workout':
    case 'review_update_workout':
      return 'workout_focus'
    case 'initial_diet':
    case 'review_update_diet':
      return 'nutrition_focus'
    case 'initial_cardio':
    case 'review_update_cardio':
      return 'cardio_focus'
    case 'initial_supplements':
    case 'review_update_supplements':
      return 'supplements_focus'
    default:
      return 'full'
  }
}

/** Diet-only plan context for weekly workout prompts (keeps active workout from DB). */
function buildUpdatedDietPlanForPrompt(
  activePlan: Plan | null,
  draft: Partial<PlanFormData> | null | undefined
): Plan | null {
  if (!activePlan && !draft?.nutrition_plan?.trim()) return null

  const now = new Date().toISOString()
  const base = activePlan ?? {
    id: 'draft-context',
    client_id: draft?.client_id ?? '',
    coach_id: '',
    title: draft?.title?.trim() || 'Updated diet draft',
    phase: draft?.phase?.trim() || null,
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

  if (!draft) return base

  return {
    ...base,
    title: draft.title?.trim() || base.title,
    phase: draft.phase?.trim() || base.phase,
    nutrition_plan: draft.nutrition_plan?.trim() || base.nutrition_plan,
    cardio_plan: draft.cardio_plan?.trim() || base.cardio_plan,
    supplement_plan: draft.supplement_plan?.trim() || base.supplement_plan,
    coach_notes: draft.coach_notes?.trim() || base.coach_notes,
    workout_plan: base.workout_plan,
  }
}

function isWeeklyUpdateAction(actionId: CoachAiActionId): boolean {
  return (
    actionId === 'review_update_diet' ||
    actionId === 'review_update_workout' ||
    actionId === 'review_update_cardio' ||
    actionId === 'review_update_supplements'
  )
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
  }

  const { data: coach, error: coachError } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (coachError || !coach) {
    return NextResponse.json({ success: false, error: 'Coach access required' }, { status: 403 })
  }

  let body: GeneratePlanRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const clientId = body.clientId?.trim()
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'clientId is required' }, { status: 400 })
  }

  const actionRaw = body.action?.trim()
  const isLegacyFullPlan = !actionRaw

  if (actionRaw && !isCoachAiActionId(actionRaw)) {
    return NextResponse.json({ success: false, error: 'Invalid coaching action' }, { status: 400 })
  }

  const actionId = (actionRaw as CoachAiActionId | undefined) ?? 'initial_diet'
  const action = actionRaw ? getCoachAiAction(actionId)! : null
  const coachNote = body.coachNote ?? body.coachInstructions ?? null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ success: false, error: profileError.message }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json(
      { success: false, error: 'Client not found or not assigned to you' },
      { status: 404 }
    )
  }

  let checkin: Checkin | null = null
  if (action?.requiresCheckin) {
    const checkinId = body.checkinId?.trim()
    if (!checkinId) {
      return NextResponse.json({ success: false, error: 'checkinId is required for this action' }, { status: 400 })
    }
    const { data: checkinData, error: checkinError } = await supabase
      .from('checkins')
      .select('*')
      .eq('id', checkinId)
      .eq('client_id', clientId)
      .eq('coach_id', coach.id)
      .maybeSingle()

    if (checkinError) {
      return NextResponse.json({ success: false, error: checkinError.message }, { status: 500 })
    }
    if (!checkinData) {
      return NextResponse.json({ success: false, error: 'Check-in not found' }, { status: 404 })
    }
    checkin = checkinData as Checkin
  }

  const { data: activePlanData } = await supabase
    .from('plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('coach_id', coach.id)
    .eq('active', true)
    .maybeSingle()

  const activePlan = (activePlanData as Plan | null) ?? null

  if (!isLegacyFullPlan && isWeeklyUpdateAction(actionId) && !activePlan) {
    return NextResponse.json(
      { success: false, error: 'An active plan is required for weekly updates.' },
      { status: 400 }
    )
  }

  const updatedDietPlanForPrompt =
    actionId === 'review_update_workout'
      ? buildUpdatedDietPlanForPrompt(activePlan, body.draftPlanContext)
      : null

  const { data: latestCheckin } = await supabase
    .from('checkins')
    .select('*')
    .eq('client_id', clientId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const checkinForPrompt = checkin ?? (latestCheckin as Checkin | null)

  const startedAt = Date.now()
  const actionLabel = isLegacyFullPlan ? 'legacy_full_plan' : actionId
  const knowledgeCategories = selectKnowledgeCategories(profile as OnboardingProfile)

  const writeTrace = async (input: {
    success: boolean
    model: string | null
    promptTokens: number | null
    completionTokens: number | null
    retryCount: number
    validationResult: string
    promptVersion?: string | null
    rawOutput?: unknown
    renderedOutput?: unknown
  }) => {
    await logAiGeneration({
      clientId,
      coachId: coach.id,
      action: actionLabel,
      model: input.model,
      promptVersion: input.promptVersion,
      latencyMs: Date.now() - startedAt,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      retryCount: input.retryCount,
      validationResult: input.validationResult,
      success: input.success,
      knowledgeRefs: knowledgeCategories,
      rawOutput: input.rawOutput,
      renderedOutput: input.renderedOutput,
      cacheReport: getLastCompileReport(),
    })
  }

  try {
    const actionInstructions = isLegacyFullPlan
      ? coachNote
      : buildActionCoachInstructions(actionId, {
          coachNote,
          activePlan,
          checkin,
        })

    const result = await generatePlan({
      profile: profile as OnboardingProfile,
      latestCheckin: checkinForPrompt,
      coachInstructions: actionInstructions,
      validationMode: actionValidationMode(actionId, isLegacyFullPlan),
      actionId: isLegacyFullPlan ? undefined : actionId,
      activePlan,
      updatedDietPlan: updatedDietPlanForPrompt,
    })

    const knowledgeCategoriesForReasoning = knowledgeCategories
    const aiReasoning = buildAiReasoningDisplay({
      complexityTier: result.complexityScore.tier,
      complexityScore: result.complexityScore.score,
      model: result.model,
      knowledgeCategories: knowledgeCategoriesForReasoning,
      coachNotes: result.generatedPlan.coach_notes,
      complexityReasons: result.complexityScore.reasoning,
    })

    let formData: PlanFormData
    if (isLegacyFullPlan) {
      formData = generatedPlanToFormData(result.generatedPlan, clientId)
    } else if (actionId === 'initial_diet' || actionId === 'review_update_diet') {
      const diet = generatedDietFormData(result.generatedPlan, clientId)
      if (activePlan && actionId === 'review_update_diet') {
        const active = planToForm(activePlan)
        formData = mergePlanForms(active, {
          nutrition_plan: diet.nutrition_plan,
          coach_notes: diet.coach_notes,
          title: `${active.title} (Diet update draft)`,
        })
      } else {
        formData = diet
      }
    } else if (actionId === 'initial_workout' || actionId === 'review_update_workout') {
      const workout = generatedWorkoutFormData(result.generatedPlan, clientId)
      if (activePlan && actionId === 'review_update_workout') {
        const active = planToForm(activePlan)
        const dietFromDraft = body.draftPlanContext
          ? {
              nutrition_plan:
                body.draftPlanContext.nutrition_plan?.trim() || active.nutrition_plan,
              cardio_plan: body.draftPlanContext.cardio_plan?.trim() || active.cardio_plan,
              supplement_plan:
                body.draftPlanContext.supplement_plan?.trim() || active.supplement_plan,
              coach_notes: body.draftPlanContext.coach_notes?.trim() || active.coach_notes,
            }
          : null
        formData = mergePlanForms(active, {
          ...(dietFromDraft ?? {}),
          workout_plan: workout.workout_plan,
          coach_notes: workout.coach_notes,
          title: `${active.title} (Workout update draft)`,
        })
      } else {
        formData = workout
      }
    } else if (actionId === 'initial_cardio' || actionId === 'review_update_cardio') {
      const cardio = generatedCardioFormData(result.generatedPlan, clientId)
      if (activePlan && actionId === 'review_update_cardio') {
        const active = planToForm(activePlan)
        formData = mergePlanForms(active, {
          cardio_plan: cardio.cardio_plan,
          title: `${active.title} (Cardio update draft)`,
        })
      } else {
        formData = cardio
      }
    } else if (actionId === 'initial_supplements' || actionId === 'review_update_supplements') {
      const supplements = generatedSupplementFormData(result.generatedPlan, clientId)
      if (activePlan && actionId === 'review_update_supplements') {
        const active = planToForm(activePlan)
        formData = mergePlanForms(active, {
          supplement_plan: supplements.supplement_plan,
          title: `${active.title} (Supplement update draft)`,
        })
      } else {
        formData = supplements
      }
    } else {
      formData = generatedPlanToFormData(result.generatedPlan, clientId)
    }

    await writeTrace({
      success: true,
      model: result.model,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      retryCount: result.retryCount,
      validationResult: 'pass',
      promptVersion: result.promptVersion,
      rawOutput: result.generatedPlan,
      renderedOutput: formData,
    })

    return NextResponse.json({
      success: true,
      formData,
      generatedPlan: result.generatedPlan,
      complexityScore: result.complexityScore,
      aiReasoning,
      selectedModel: result.model,
      estimatedTokens: result.estimatedTokens,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      generationTimeMs: Date.now() - startedAt,
    })
  } catch (err) {
    const failureMessage =
      err instanceof ClaudeResponseError
        ? `Anthropic plan generation failed${err.status ? ` (HTTP ${err.status})` : ''}: ${err.message}`
        : err instanceof GeneratePlanError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Plan generation failed'

    await writeTrace({
      success: false,
      model: null,
      promptTokens: null,
      completionTokens: null,
      retryCount: 1,
      validationResult: failureMessage,
    })

    if (err instanceof ClaudeResponseError) {
      const detail = err.status ? ` (HTTP ${err.status})` : ''
      return NextResponse.json(
        {
          success: false,
          error: `Anthropic plan generation failed${detail}: ${err.message}`,
        },
        { status: err.status && err.status >= 400 && err.status < 600 ? err.status : 502 }
      )
    }

    const status = err instanceof GeneratePlanError ? 422 : 500

    return NextResponse.json({ success: false, error: failureMessage }, { status })
  }
}
