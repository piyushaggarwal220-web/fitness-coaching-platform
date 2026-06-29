import { NextResponse } from 'next/server'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import {
  generatedDietFormData,
  generatedPlanToFormData,
  generatedWorkoutFormData,
} from '@/lib/ai/plan-format'
import { generatePlan, GeneratePlanError, type PlanValidationMode } from '@/lib/ai/generate-plan'
import { selectKnowledgeCategories } from '@/lib/ai/prompt-builder'
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

type GeneratePlanRequestBody = {
  clientId?: string
  action?: string
  coachNote?: string
  coachInstructions?: string
  checkinId?: string
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
    case 'review_analyze_checkin':
    case 'review_coach_message':
      return 'minimal'
    default:
      return 'full'
  }
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

  const { data: activePlan } = await supabase
    .from('plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('coach_id', coach.id)
    .eq('active', true)
    .maybeSingle()

  const { data: latestCheckin } = await supabase
    .from('checkins')
    .select('*')
    .eq('client_id', clientId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const checkinForPrompt = checkin ?? (latestCheckin as Checkin | null)

  const startedAt = Date.now()

  try {
    const coachInstructions = isLegacyFullPlan
      ? coachNote
      : buildActionCoachInstructions(actionId, {
          coachNote,
          activePlan: (activePlan as Plan | null) ?? null,
          checkin: checkinForPrompt,
        })

    const result = await generatePlan({
      profile: profile as OnboardingProfile,
      latestCheckin: checkinForPrompt,
      coachInstructions,
      validationMode: actionValidationMode(actionId, isLegacyFullPlan),
    })

    const knowledgeCategories = selectKnowledgeCategories(profile as OnboardingProfile)
    const aiReasoning = buildAiReasoningDisplay({
      complexityTier: result.complexityScore.tier,
      complexityScore: result.complexityScore.score,
      model: result.model,
      knowledgeCategories,
      coachNotes: result.generatedPlan.coach_notes,
      complexityReasons: result.complexityScore.reasoning,
    })

    if (!isLegacyFullPlan && actionId === 'review_analyze_checkin') {
      return NextResponse.json({
        success: true,
        insightText: result.generatedPlan.coach_notes.trim(),
        aiReasoning,
        selectedModel: result.model,
        generationTimeMs: Date.now() - startedAt,
      })
    }

    if (!isLegacyFullPlan && actionId === 'review_coach_message') {
      return NextResponse.json({
        success: true,
        coachMessage: result.generatedPlan.coach_notes.trim(),
        aiReasoning,
        selectedModel: result.model,
        generationTimeMs: Date.now() - startedAt,
      })
    }

    let formData: PlanFormData
    if (isLegacyFullPlan) {
      formData = generatedPlanToFormData(result.generatedPlan, clientId)
    } else if (actionId === 'initial_diet' || actionId === 'review_update_diet') {
      const diet = generatedDietFormData(result.generatedPlan, clientId)
      if (activePlan && actionId === 'review_update_diet') {
        const active = planToForm(activePlan as Plan)
        formData = mergePlanForms(active, {
          nutrition_plan: diet.nutrition_plan,
          cardio_plan: diet.cardio_plan,
          supplement_plan: diet.supplement_plan,
          coach_notes: diet.coach_notes,
          title: `${active.title} (Diet update draft)`,
        })
      } else {
        formData = diet
      }
    } else if (actionId === 'initial_workout' || actionId === 'review_update_workout') {
      const workout = generatedWorkoutFormData(result.generatedPlan, clientId)
      if (activePlan && actionId === 'review_update_workout') {
        const active = planToForm(activePlan as Plan)
        formData = mergePlanForms(active, {
          workout_plan: workout.workout_plan,
          cardio_plan: workout.cardio_plan,
          coach_notes: workout.coach_notes,
          title: `${active.title} (Workout update draft)`,
        })
      } else {
        formData = workout
      }
    } else {
      formData = generatedPlanToFormData(result.generatedPlan, clientId)
    }

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

    const message =
      err instanceof GeneratePlanError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Plan generation failed'

    const status = err instanceof GeneratePlanError ? 422 : 500

    return NextResponse.json({ success: false, error: message }, { status })
  }
}
