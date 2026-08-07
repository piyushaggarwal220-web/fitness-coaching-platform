import 'server-only'
import { generatePlan } from '@/lib/ai/generate-plan'
import {
  generatedDietFormData,
  generatedWorkoutFormData,
} from '@/lib/ai/plan-format'
import { buildActionCoachInstructions, mergePlanForms } from '@/lib/coach/ai-actions'
import { encodePlanMeta } from '@/lib/plan-metadata'
import { persistAiPlanDraft } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile, Plan } from '@/types/database'

export const PLAN_CHANGE_DAILY_LIMIT = 1
export const PLAN_CHANGE_MONTHLY_LIMIT = 5
export const PLAN_CHANGE_MIN_CHARS = 10
export const PLAN_CHANGE_MAX_CHARS = 4000

/** Word-overlap similarity; near 1.0 means the model barely changed the plan. */
export function planTextSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    )
  const wa = tokenize(a)
  const wb = tokenize(b)
  if (wa.size === 0 && wb.size === 0) return 1
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter += 1
  return inter / Math.max(wa.size, wb.size)
}

const NEAR_COPY_SIMILARITY = 0.93

export type PlanChangeScope = 'diet' | 'workout' | 'both'

export type PlanChangeRequestRow = {
  id: string
  client_id: string
  coach_id: string
  active_plan_id: string | null
  draft_plan_id: string | null
  request_text: string
  scope: PlanChangeScope
  status: string
  error_message: string | null
  locked_at: string
  generation_started_at: string | null
  draft_ready_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type PlanChangeQuota = {
  usedToday: number
  usedThisMonth: number
  remainingToday: number
  remainingThisMonth: number
  canSubmit: boolean
  openRequest: PlanChangeRequestRow | null
}

function startOfLocalDayIso(d = new Date()): string {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

function startOfMonthIso(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), 1)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

export async function getPlanChangeQuota(clientId: string): Promise<PlanChangeQuota> {
  const admin = createAdminClient()
  const dayStart = startOfLocalDayIso()
  const monthStart = startOfMonthIso()

  const [{ data: todayRows }, { data: monthRows }, { data: openRows }] = await Promise.all([
    admin
      .from('plan_change_requests')
      .select('id')
      .eq('client_id', clientId)
      .gte('locked_at', dayStart),
    admin
      .from('plan_change_requests')
      .select('id')
      .eq('client_id', clientId)
      .gte('locked_at', monthStart),
    admin
      .from('plan_change_requests')
      .select('*')
      .eq('client_id', clientId)
      .in('status', ['generating', 'draft_ready', 'in_review'])
      .order('locked_at', { ascending: false })
      .limit(1),
  ])

  const usedToday = todayRows?.length ?? 0
  const usedThisMonth = monthRows?.length ?? 0
  const remainingToday = Math.max(0, PLAN_CHANGE_DAILY_LIMIT - usedToday)
  const remainingThisMonth = Math.max(0, PLAN_CHANGE_MONTHLY_LIMIT - usedThisMonth)
  const openRequest = (openRows?.[0] as PlanChangeRequestRow | undefined) ?? null

  return {
    usedToday,
    usedThisMonth,
    remainingToday,
    remainingThisMonth,
    canSubmit: remainingToday > 0 && remainingThisMonth > 0 && !openRequest,
    openRequest,
  }
}

export async function createLockedPlanChangeRequest(input: {
  clientId: string
  coachId: string
  activePlanId: string
  requestText: string
  scope: PlanChangeScope
}): Promise<{ ok: true; request: PlanChangeRequestRow } | { ok: false; error: string; status: number }> {
  const text = input.requestText.trim()
  if (text.length < PLAN_CHANGE_MIN_CHARS) {
    return { ok: false, error: 'Please describe all changes you need (at least a short paragraph).', status: 400 }
  }
  if (text.length > PLAN_CHANGE_MAX_CHARS) {
    return { ok: false, error: 'Keep your request under 4000 characters.', status: 400 }
  }
  if (!['diet', 'workout', 'both'].includes(input.scope)) {
    return { ok: false, error: 'Choose diet, workout, or both.', status: 400 }
  }

  const quota = await getPlanChangeQuota(input.clientId)
  if (quota.openRequest) {
    return {
      ok: false,
      error: 'You already have a change request in progress. Wait for your coach to review it.',
      status: 409,
    }
  }
  if (quota.remainingToday <= 0) {
    return {
      ok: false,
      error: 'You can lock in only 1 change request per day. Include every issue in one request next time.',
      status: 429,
    }
  }
  if (quota.remainingThisMonth <= 0) {
    return {
      ok: false,
      error: 'Monthly limit reached (5 change requests per month). Try again next month.',
      status: 429,
    }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('plan_change_requests')
    .insert({
      client_id: input.clientId,
      coach_id: input.coachId,
      active_plan_id: input.activePlanId,
      request_text: text,
      scope: input.scope,
      status: 'generating',
      locked_at: now,
      generation_started_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error || !data) {
    if (error?.code === '23505') {
      return {
        ok: false,
        error: 'You already have a change request in progress.',
        status: 409,
      }
    }
    console.error('[plan-change] create failed', error?.message)
    return { ok: false, error: 'Could not lock in your request. Please retry.', status: 500 }
  }

  return { ok: true, request: data as PlanChangeRequestRow }
}

function buildUpdatedDietContext(active: Plan, nutrition: string): Plan {
  const now = new Date().toISOString()
  return {
    ...active,
    nutrition_plan: nutrition,
    updated_at: now,
  }
}

/** Background processor: generate draft from client lock-in, then queue for coach. */
export async function processPlanChangeRequest(requestId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('plan_change_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()

  if (error || !row) {
    console.error('[plan-change] missing request', requestId, error?.message)
    return
  }

  const request = row as PlanChangeRequestRow
  if (request.status !== 'generating') return

  try {
    const [{ data: profile }, { data: activePlan }, { data: latestCheckin }] = await Promise.all([
      admin.from('profiles').select('*').eq('id', request.client_id).single(),
      request.active_plan_id
        ? admin.from('plans').select('*').eq('id', request.active_plan_id).maybeSingle()
        : admin
            .from('plans')
            .select('*')
            .eq('client_id', request.client_id)
            .eq('active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
      admin
        .from('checkins')
        .select('*')
        .eq('client_id', request.client_id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (!profile) throw new Error('Client profile not found')
    const active = (activePlan as Plan | null) ?? null
    if (!active) throw new Error('No active plan to edit')
    const checkin = (latestCheckin as Checkin | null) ?? null

    const clientInstructions = [
      'CLIENT LOCKED-IN CHANGE REQUEST (must address every point with VISIBLE edits):',
      request.request_text,
      '',
      'Hard rules for this generation:',
      '- Do not return a near-copy of the current plan.',
      '- Every bullet in the request must map to a concrete meal, macro, exercise, volume, or schedule change.',
      '- Opening lines of the section must name what changed vs the previous plan and why.',
      '- Keep hard constraints from onboarding.',
      '- Produce a full updated section for coach review — do not auto-publish.',
    ].join('\n')

    const retryDiffInstructions = [
      'RETRY — previous draft was too similar to the current plan.',
      'Rewrite with clear, coach-obvious differences that satisfy the client request.',
      'Change meal compositions / exercise selections / sets-reps / calories as needed — do not paraphrase the same plan.',
    ].join('\n')

    let dietForm = {
      nutrition_plan: active.nutrition_plan?.trim() || '',
      title: active.title,
      phase: active.phase ?? '',
      workout_plan: '',
      cardio_plan: active.cardio_plan?.trim() || '',
      supplement_plan: active.supplement_plan?.trim() || '',
      coach_notes: '',
      client_id: request.client_id,
    }

    let workoutForm = {
      workout_plan: active.workout_plan?.trim() || '',
    }

    if (request.scope === 'diet' || request.scope === 'both') {
      let dietResult = await generatePlan({
        profile: profile as OnboardingProfile,
        latestCheckin: checkin,
        actionId: 'review_update_diet',
        activePlan: active,
        validationMode: 'nutrition_focus',
        coachInstructions: [
          buildActionCoachInstructions('review_update_diet', {
            activePlan: active,
            checkin,
          }),
          clientInstructions,
        ].join('\n\n'),
      })
      dietForm = {
        ...generatedDietFormData(dietResult.generatedPlan, request.client_id),
        client_id: request.client_id,
        title: `AI Draft · Client request`,
      }

      const priorNutrition = active.nutrition_plan?.trim() || ''
      if (
        priorNutrition &&
        planTextSimilarity(priorNutrition, dietForm.nutrition_plan) >= NEAR_COPY_SIMILARITY
      ) {
        dietResult = await generatePlan({
          profile: profile as OnboardingProfile,
          latestCheckin: checkin,
          actionId: 'review_update_diet',
          activePlan: active,
          validationMode: 'nutrition_focus',
          coachInstructions: [
            buildActionCoachInstructions('review_update_diet', {
              activePlan: active,
              checkin,
            }),
            clientInstructions,
            retryDiffInstructions,
          ].join('\n\n'),
        })
        dietForm = {
          ...generatedDietFormData(dietResult.generatedPlan, request.client_id),
          client_id: request.client_id,
          title: `AI Draft · Client request`,
        }
      }
    }

    if (request.scope === 'workout' || request.scope === 'both') {
      const updatedDietContext =
        request.scope === 'both'
          ? buildUpdatedDietContext(active, dietForm.nutrition_plan)
          : active
      let workoutResult = await generatePlan({
        profile: profile as OnboardingProfile,
        latestCheckin: checkin,
        actionId: 'review_update_workout',
        activePlan: active,
        updatedDietPlan: updatedDietContext,
        validationMode: 'workout_focus',
        coachInstructions: [
          buildActionCoachInstructions('review_update_workout', {
            activePlan: active,
            checkin,
          }),
          clientInstructions,
        ].join('\n\n'),
      })
      workoutForm = generatedWorkoutFormData(workoutResult.generatedPlan, request.client_id)

      const priorWorkout = active.workout_plan?.trim() || ''
      if (
        priorWorkout &&
        planTextSimilarity(priorWorkout, workoutForm.workout_plan) >= NEAR_COPY_SIMILARITY
      ) {
        workoutResult = await generatePlan({
          profile: profile as OnboardingProfile,
          latestCheckin: checkin,
          actionId: 'review_update_workout',
          activePlan: active,
          updatedDietPlan: updatedDietContext,
          validationMode: 'workout_focus',
          coachInstructions: [
            buildActionCoachInstructions('review_update_workout', {
              activePlan: active,
              checkin,
            }),
            clientInstructions,
            retryDiffInstructions,
          ].join('\n\n'),
        })
        workoutForm = generatedWorkoutFormData(workoutResult.generatedPlan, request.client_id)
      }
    }

    const merged = mergePlanForms(
      {
        ...dietForm,
        client_id: request.client_id,
        title: 'AI Draft · Client request',
        workout_plan: request.scope === 'diet' ? active.workout_plan?.trim() || '' : workoutForm.workout_plan,
        cardio_plan: active.cardio_plan?.trim() || dietForm.cardio_plan,
        supplement_plan: active.supplement_plan?.trim() || dietForm.supplement_plan,
        nutrition_plan:
          request.scope === 'workout' ? active.nutrition_plan?.trim() || '' : dietForm.nutrition_plan,
      },
      {}
    )

    const metaNotes = encodePlanMeta(
      {
        generatedBy: 'ai',
        source: 'client_plan_change',
      },
      [
        'Client requested edits (locked in). Review carefully before delivering.',
        `Request id: ${request.id}`,
        `Scope: ${request.scope}`,
        `Request:\n${request.request_text}`,
      ].join('\n\n')
    )

    const { data: draft, error: draftError } = await persistAiPlanDraft(admin, {
      clientId: request.client_id,
      coachId: request.coach_id,
      form: { ...merged, coach_notes: metaNotes ?? '' },
      title: 'AI Draft · Client request',
    })

    if (draftError || !draft) throw new Error(draftError ?? 'Failed to save draft')

    const now = new Date().toISOString()
    await admin
      .from('plan_change_requests')
      .update({
        status: 'draft_ready',
        draft_plan_id: draft.id,
        draft_ready_at: now,
        updated_at: now,
        error_message: null,
      })
      .eq('id', request.id)
      // Don't reopen a request the coach already completed/cancelled from the queue.
      .eq('status', 'generating')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    console.error('[plan-change] process failed', requestId, message)
    await admin
      .from('plan_change_requests')
      .update({
        status: 'failed',
        error_message: message.slice(0, 500),
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'generating')
  }
}
