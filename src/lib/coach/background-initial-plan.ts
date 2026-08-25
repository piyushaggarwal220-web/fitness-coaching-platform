import { after } from 'next/server'
import {
  generatedCardioFormData,
  generatedDietFormData,
  generatedSupplementFormData,
  generatedWorkoutFormData,
} from '@/lib/ai/plan-format'
import { generatePlan, type PlanValidationMode } from '@/lib/ai/generate-plan'
import { logAiGeneration } from '@/lib/ai/trace-log'
import { buildActionCoachInstructions, mergePlanForms, type CoachAiActionId } from '@/lib/coach/ai-actions'
import { persistAiPlanDraft, updateAiPlanDraft } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile, Plan, PlanFormData } from '@/types/database'

export const MANUAL_PLAN_STARTED_ACTION = 'manual_plan_started'
export const MANUAL_PLAN_FINISHED_ACTION = 'manual_plan_finished'
const STALE_MS = 20 * 60 * 1000

const INITIAL_ACTIONS: CoachAiActionId[] = [
  'initial_diet',
  'initial_workout',
  'initial_cardio',
  'initial_supplements',
]

function validationMode(actionId: CoachAiActionId): PlanValidationMode {
  if (actionId === 'initial_workout') return 'workout_focus'
  if (actionId === 'initial_diet') return 'nutrition_focus'
  if (actionId === 'initial_cardio') return 'cardio_focus'
  if (actionId === 'initial_supplements') return 'supplements_focus'
  return 'full'
}

function sectionTitle(actionId: CoachAiActionId): string {
  if (actionId === 'initial_diet') return 'Diet Plan (Draft)'
  if (actionId === 'initial_workout') return 'Workout Plan (Draft)'
  if (actionId === 'initial_cardio') return 'Cardio Plan (Draft)'
  return 'Supplement Plan (Draft)'
}

export async function markManualPlanStarted(input: {
  clientId: string
  coachId: string
  mode: 'complete' | CoachAiActionId
}): Promise<void> {
  await logAiGeneration({
    clientId: input.clientId,
    coachId: input.coachId,
    action: MANUAL_PLAN_STARTED_ACTION,
    model: null,
    promptVersion: 'manual_plan',
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    retryCount: 0,
    validationResult: 'started',
    success: true,
    knowledgeRefs: null,
    renderedOutput: { mode: input.mode, phase: 'started' },
  })
}

async function markManualPlanFinished(input: {
  clientId: string
  coachId: string
  success: boolean
  error?: string | null
  draftPlanId?: string | null
}): Promise<void> {
  await logAiGeneration({
    clientId: input.clientId,
    coachId: input.coachId,
    action: MANUAL_PLAN_FINISHED_ACTION,
    model: null,
    promptVersion: 'manual_plan',
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    retryCount: 0,
    validationResult: input.success ? 'pass' : (input.error ?? 'failed'),
    success: input.success,
    knowledgeRefs: null,
    renderedOutput: {
      phase: input.success ? 'finished' : 'failed',
      error: input.error ?? null,
      draftPlanId: input.draftPlanId ?? null,
    },
  })
}

async function generateSectionForm(
  profile: OnboardingProfile,
  actionId: CoachAiActionId,
  coachNote: string | null,
  activePlan: Plan | null
): Promise<PlanFormData> {
  const result = await generatePlan({
    profile,
    latestCheckin: null,
    coachInstructions: buildActionCoachInstructions(actionId, {
      coachNote,
      activePlan,
      checkin: null,
    }),
    validationMode: validationMode(actionId),
    actionId,
    activePlan,
  })

  if (actionId === 'initial_diet') return generatedDietFormData(result.generatedPlan, profile.id)
  if (actionId === 'initial_workout') return generatedWorkoutFormData(result.generatedPlan, profile.id)
  if (actionId === 'initial_cardio') return generatedCardioFormData(result.generatedPlan, profile.id)
  return generatedSupplementFormData(result.generatedPlan, profile.id)
}

export async function runManualPlanJob(input: {
  clientId: string
  coachId: string
  coachNote: string | null
  mode: 'complete' | CoachAiActionId
}): Promise<void> {
  const admin = createAdminClient()
  const started = Date.now()
  try {
    const { data: profile } = await admin.from('profiles').select('*').eq('id', input.clientId).maybeSingle()
    if (!profile) throw new Error('Client not found')

    const { data: activePlanData } = await admin
      .from('plans')
      .select('*')
      .eq('client_id', input.clientId)
      .eq('active', true)
      .maybeSingle()
    const activePlan = (activePlanData as Plan | null) ?? null

    if (input.mode !== 'complete') {
      const form = await generateSectionForm(
        profile as OnboardingProfile,
        input.mode,
        input.coachNote,
        activePlan
      )
      form.title = sectionTitle(input.mode)
      const saved = await persistAiPlanDraft(admin, {
        clientId: input.clientId,
        coachId: input.coachId,
        form,
        title: `AI Draft · ${form.title}`,
      })
      if (saved.error) throw new Error(saved.error)
      await markManualPlanFinished({
        clientId: input.clientId,
        coachId: input.coachId,
        success: true,
        draftPlanId: saved.data?.id ?? null,
      })
      return
    }

    const diet = await generateSectionForm(profile as OnboardingProfile, 'initial_diet', input.coachNote, activePlan)
    let merged: PlanFormData = { ...diet, title: 'Complete Coaching Plan (Draft)' }
    const first = await persistAiPlanDraft(admin, {
      clientId: input.clientId,
      coachId: input.coachId,
      form: merged,
      title: 'AI Draft · Initial Diet',
    })
    if (first.error || !first.data) throw new Error(first.error ?? 'Failed to save diet draft')
    let draftId = first.data.id

    const workout = await generateSectionForm(
      profile as OnboardingProfile,
      'initial_workout',
      input.coachNote,
      activePlan
    )
    merged = mergePlanForms(merged, {
      workout_plan: workout.workout_plan,
      coach_notes: [merged.coach_notes, workout.coach_notes].filter(Boolean).join('\n\n'),
    })
    await updateAiPlanDraft(admin, draftId, merged, 'AI Draft · Diet + Workout')

    try {
      const cardio = await generateSectionForm(
        profile as OnboardingProfile,
        'initial_cardio',
        input.coachNote,
        activePlan
      )
      if (cardio.cardio_plan?.trim()) {
        merged = mergePlanForms(merged, { cardio_plan: cardio.cardio_plan })
        await updateAiPlanDraft(admin, draftId, merged, 'AI Draft · Diet + Workout + Cardio')
      }
    } catch (err) {
      console.warn('[manual-plan] cardio skipped', err)
    }

    try {
      const supplements = await generateSectionForm(
        profile as OnboardingProfile,
        'initial_supplements',
        input.coachNote,
        activePlan
      )
      if (supplements.supplement_plan?.trim()) {
        merged = mergePlanForms(merged, { supplement_plan: supplements.supplement_plan })
      }
    } catch (err) {
      console.warn('[manual-plan] supplements skipped', err)
    }

    await updateAiPlanDraft(admin, draftId, merged, 'AI Draft · Initial Plan')
    await markManualPlanFinished({
      clientId: input.clientId,
      coachId: input.coachId,
      success: true,
      draftPlanId: draftId,
    })
    console.info('[manual-plan] complete', { clientId: input.clientId, ms: Date.now() - started, draftId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Plan generation failed'
    await markManualPlanFinished({
      clientId: input.clientId,
      coachId: input.coachId,
      success: false,
      error: message.slice(0, 500),
    })
    console.error('[manual-plan] failed', { clientId: input.clientId, message })
  }
}

export function queueManualPlanJob(input: {
  clientId: string
  coachId: string
  coachNote: string | null
  mode: 'complete' | CoachAiActionId
}): void {
  after(() => runManualPlanJob(input))
}

export function isInitialPlanAction(action: string): action is CoachAiActionId {
  return INITIAL_ACTIONS.includes(action as CoachAiActionId)
}

export type ManualPlanJobStatus = {
  status: 'idle' | 'generating' | 'ready' | 'failed'
  draftPlanId: string | null
  error: string | null
  updatedAt: string | null
}

export async function loadManualPlanJobStatus(
  clientId: string,
  coachId: string
): Promise<ManualPlanJobStatus> {
  const admin = createAdminClient()
  const { data: logs } = await admin
    .from('ai_generation_logs')
    .select('action, success, validation_result, created_at, rendered_output')
    .eq('client_id', clientId)
    .eq('coach_id', coachId)
    .in('action', [MANUAL_PLAN_STARTED_ACTION, MANUAL_PLAN_FINISHED_ACTION])
    .order('created_at', { ascending: false })
    .limit(8)

  const latest = logs?.[0] as
    | {
        action: string
        success: boolean
        validation_result: string | null
        created_at: string
        rendered_output: { draftPlanId?: string; error?: string } | null
      }
    | undefined

  const { data: draft } = await admin
    .from('plans')
    .select('id, title, updated_at')
    .eq('client_id', clientId)
    .eq('coach_id', coachId)
    .eq('active', false)
    .is('delivered_at', null)
    .ilike('title', 'AI Draft%')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) {
    return {
      status: 'idle',
      draftPlanId: (draft?.id as string | undefined) ?? null,
      error: null,
      updatedAt: (draft?.updated_at as string | undefined) ?? null,
    }
  }

  const ageMs = Date.now() - new Date(latest.created_at).getTime()
  if (latest.action === MANUAL_PLAN_STARTED_ACTION && ageMs < STALE_MS) {
    return {
      status: 'generating',
      draftPlanId: (draft?.id as string | undefined) ?? null,
      error: null,
      updatedAt: latest.created_at,
    }
  }

  if (latest.action === MANUAL_PLAN_FINISHED_ACTION && latest.success) {
    return {
      status: 'ready',
      draftPlanId:
        latest.rendered_output?.draftPlanId ?? (draft?.id as string | undefined) ?? null,
      error: null,
      updatedAt: latest.created_at,
    }
  }

  if (latest.action === MANUAL_PLAN_FINISHED_ACTION && !latest.success) {
    return {
      status: 'failed',
      draftPlanId: (draft?.id as string | undefined) ?? null,
      error: latest.rendered_output?.error ?? latest.validation_result,
      updatedAt: latest.created_at,
    }
  }

  return {
    status: ageMs >= STALE_MS ? 'failed' : 'idle',
    draftPlanId: (draft?.id as string | undefined) ?? null,
    error: ageMs >= STALE_MS ? 'Generation timed out. Retry from this page.' : null,
    updatedAt: latest.created_at,
  }
}
