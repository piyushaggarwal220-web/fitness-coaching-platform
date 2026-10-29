import 'server-only'

import { MODELS } from '@/lib/ai/config'
import { editPlanSection, type PlanSectionKind } from '@/lib/ai/edit-plan-section'
import { syncStoredDietText } from '@/lib/ai/nutrition-macro-sync'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import {
  PLANNER_DECISION_LOG_PROMPT,
  checkinBriefMarker,
  formatPlannerMidWeekBrief,
  midWeekBriefMarker,
  crosscheckPlannerSections,
  estimateTokens,
  formatPlannerCheckinBrief,
  labeledDayCount,
  meaningfulConstraint,
  parseConstraintFailures,
  parsePlannerDecision,
  plannerModelWindow,
  plannerSectionsToScope,
  summaryTimestamp,
  type PlannerContextMessage,
  type PlannerSection,
  type PlannerUpdate,
} from '@/lib/ai/client-planner-pure'
import { inferPlanChangeScope } from '@/lib/ai/ai-coach-plan-change-pure'
import { loadSameWeekMidWeekCheckin } from '@/lib/ai/same-week-midweek'
import { activatePlan, persistAiPlanDraft } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile } from '@/types/database'

const MAX_PLAN_ATTEMPTS = 3
const MAX_COACH_MESSAGE = 8000

type Admin = ReturnType<typeof createAdminClient>

export type PlannerMessageRow = PlannerContextMessage & {
  id: string
  published_plan_id: string | null
  plan_change_request_id: string | null
}

type ActivePlan = {
  id: string
  title: string | null
  phase: string | null
  nutrition_plan: string | null
  workout_plan: string | null
  cardio_plan: string | null
  supplement_plan: string | null
  coach_notes: string | null
}

type ClientProfile = Pick<
  OnboardingProfile,
  | 'weight'
  | 'height'
  | 'age'
  | 'gender'
  | 'activity_level'
  | 'fitness_goal'
  | 'onboarding_data'
  | 'sleep_duration'
  | 'training_experience'
  | 'injuries'
  | 'diet_preference'
  | 'medical_notes'
> & { id: string; name: string | null; coach_id: string | null }

const PROFILE_COLUMNS =
  'id, name, coach_id, weight, height, age, gender, activity_level, fitness_goal, onboarding_data, sleep_duration, training_experience, injuries, diet_preference, medical_notes'

function excerpt(text: string | null | undefined, max = 1200): string {
  const trimmed = text?.trim() ?? ''
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max).trimEnd()}…`
}

async function loadMessages(admin: Admin, clientId: string): Promise<PlannerMessageRow[]> {
  const { data, error } = await admin
    .from('client_planner_messages')
    .select('id, role, content, created_at, published_plan_id, plan_change_request_id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .limit(2000)
  if (error) throw new Error(error.message)
  return (data ?? []) as PlannerMessageRow[]
}

async function insertMessage(
  admin: Admin,
  input: {
    clientId: string
    coachId: string
    role: PlannerContextMessage['role']
    content: string
    createdAt?: string
    requestId?: string | null
    publishedPlanId?: string | null
  }
): Promise<PlannerMessageRow> {
  const content = input.content.trim()
  const { data, error } = await admin
    .from('client_planner_messages')
    .insert({
      client_id: input.clientId,
      coach_id: input.coachId,
      role: input.role,
      content,
      token_estimate: estimateTokens(content),
      plan_change_request_id: input.requestId ?? null,
      published_plan_id: input.publishedPlanId ?? null,
      created_at: input.createdAt ?? new Date().toISOString(),
    })
    .select('id, role, content, created_at, published_plan_id, plan_change_request_id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not save planner message')
  return data as PlannerMessageRow
}

export async function seedPlannerRequest(
  admin: Admin,
  input: { clientId: string; coachId: string; requestId: string }
): Promise<void> {
  const { data: existing } = await admin
    .from('client_planner_messages')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('plan_change_request_id', input.requestId)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return

  const { data: request } = await admin
    .from('plan_change_requests')
    .select('id, request_text, scope, status')
    .eq('id', input.requestId)
    .eq('client_id', input.clientId)
    .eq('coach_id', input.coachId)
    .maybeSingle()
  if (!request?.request_text) return

  await insertMessage(admin, {
    clientId: input.clientId,
    coachId: input.coachId,
    role: 'request',
    content: `Client request (${request.scope}): ${request.request_text}`,
    requestId: request.id,
  })
}

function constraintBlock(profile: ClientProfile): string {
  const lines = [
    meaningfulConstraint(profile.injuries) ? `Injuries: ${profile.injuries?.trim()}` : '',
    meaningfulConstraint(profile.medical_notes) ? `Medical notes: ${profile.medical_notes?.trim()}` : '',
    meaningfulConstraint(profile.diet_preference) ? `Diet preference: ${profile.diet_preference?.trim()}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

async function compactIfNeeded(
  admin: Admin,
  clientId: string,
  coachId: string,
  messages: PlannerMessageRow[],
  constraints: string
) {
  const window = plannerModelWindow(messages)
  if (!window) return messages
  const transcript = window.fold
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n\n')
  const result = await generateOpenAIResponse({
    systemPrompt: PLANNER_DECISION_LOG_PROMPT,
    userPrompt: constraints
      ? `Hard constraints:\n${constraints}\n\nTranscript:\n${transcript}`
      : transcript,
    model: MODELS.GPT_LUNA,
    maxTokens: 1200,
    temperature: 0.3,
  })
  const firstKept = window.keep[0]
  if (!firstKept) return messages
  const recap = result.text.trim() || 'Earlier messages were folded into this recap.'
  await insertMessage(admin, {
    clientId,
    coachId,
    role: 'summary',
    content: `Earlier in this chat\n\n${recap}`,
    createdAt: summaryTimestamp(firstKept.created_at),
  })
  return loadMessages(admin, clientId)
}

function modelTranscript(messages: PlannerMessageRow[]): string {
  const window = (() => {
    let summaryIndex = -1
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'summary') {
        summaryIndex = i
        break
      }
    }
    return summaryIndex >= 0 ? messages.slice(summaryIndex) : messages
  })()
  return window
    .map((message) => {
      const speaker =
        message.role === 'coach'
          ? 'Coach'
          : message.role === 'request'
            ? 'Client request'
            : message.role === 'summary'
              ? 'Recap'
              : 'Planner'
      return `${speaker}: ${message.content}`
    })
    .join('\n\n')
}

async function rewriteSupplements(current: string, instruction: string, constraints: string): Promise<string> {
  const result = await generateOpenAIResponse({
    systemPrompt: [
      'Rewrite only the supplement plan.',
      'Do not change calories, meals, workouts, or cardio.',
      'Obey the constraints. Do not add a supplement that conflicts with an injury or medical note.',
      'Return the supplement plan text only.',
    ].join('\n'),
    userPrompt: `Constraints:\n${constraints || '(none)'}\n\nCurrent supplement plan:\n${current.trim() || '(none)'}\n\nCoach instruction:\n${instruction}`,
    model: MODELS.GPT_LUNA,
    maxTokens: 4000,
    temperature: 0.4,
  })
  return result.text.trim()
}

async function rewriteSleep(current: string, instruction: string, constraints: string): Promise<string> {
  const result = await generateOpenAIResponse({
    systemPrompt: [
      'Rewrite only the sleep and water guidance.',
      'Start with the heading "Sleep and water".',
      'Include a sleep line with a number of hours, and a water line.',
      'Obey the constraints.',
      'Return that block only.',
    ].join('\n'),
    userPrompt: `Constraints:\n${constraints || '(none)'}\n\nCurrent guidance:\n${current.trim() || '(none)'}\n\nCoach instruction:\n${instruction}`,
    model: MODELS.GPT_LUNA,
    maxTokens: 600,
    temperature: 0.3,
  })
  return result.text.trim()
}

async function constraintFailures(input: {
  constraints: string
  instruction: string
  next: Record<PlannerSection, string>
  changed: PlannerSection[]
}): Promise<string[]> {
  if (!input.constraints.trim()) return []
  const body = input.changed
    .map((section) => `${section}:\n${excerpt(input.next[section], 4000) || '(empty)'}`)
    .join('\n\n')
  const result = await generateOpenAIResponse({
    systemPrompt: [
      'You check a plan draft against hard constraints.',
      'Reply with the single word PASS when the draft does not conflict with them.',
      'Otherwise reply with one bullet per real conflict, quoting the draft line and the constraint.',
      'Only flag a conflict you can point to. Do not invent constraints. Do not give advice.',
    ].join('\n'),
    userPrompt: `Constraints:\n${input.constraints}\n\nCoach instruction:\n${input.instruction}\n\nDraft:\n${body}`,
    model: MODELS.GPT_LUNA,
    maxTokens: 500,
    temperature: 0,
  })
  return parseConstraintFailures(result.text)
}

async function applyUpdate(input: {
  update: PlannerUpdate
  attemptErrors: string[]
  plan: ActivePlan | null
  profile: ClientProfile
  constraints: string
}): Promise<{ next: Record<PlannerSection, string>; errors: string[] }> {
  const instruction =
    input.attemptErrors.length > 0
      ? `${input.update.instruction}\n\nThe last draft failed this check: ${input.attemptErrors.join(' ')} Rewrite so the check passes and keep the requested change.`
      : input.update.instruction
  const guarded = input.constraints
    ? `${instruction}\n\nHard constraints you must keep:\n${input.constraints}`
    : instruction
  const next: Record<PlannerSection, string> = {
    nutrition: input.plan?.nutrition_plan ?? '',
    workout: input.plan?.workout_plan ?? '',
    cardio: input.plan?.cardio_plan ?? '',
    supplements: input.plan?.supplement_plan ?? '',
    sleep: input.plan?.coach_notes ?? '',
  }
  const profile = input.profile
  for (const section of input.update.sections) {
    if (section === 'supplements') {
      next.supplements = await rewriteSupplements(next.supplements, guarded, input.constraints)
      continue
    }
    if (section === 'sleep') {
      next.sleep = await rewriteSleep(next.sleep, guarded, input.constraints)
      continue
    }
    const current = next[section]
    const revised = await editPlanSection({
      section: section as PlanSectionKind,
      currentText: current,
      coachInstruction: guarded,
      editSource: 'coach',
      remakeFromScratch: current.trim().length === 0,
      clientName: profile.name,
      clientId: profile.id,
      profile,
    })
    next[section] = revised.revisedText
  }
  if (input.update.sections.includes('nutrition') && next.nutrition.trim()) {
    next.nutrition = syncStoredDietText(next.nutrition, { preserveCalories: false })
  }
  const changed: PlannerSection[] = [...input.update.sections]
  if (!input.plan) {
    if (!changed.includes('nutrition')) changed.push('nutrition')
    if (!changed.includes('workout')) changed.push('workout')
  }
  let errors = crosscheckPlannerSections({
    nutrition: next.nutrition,
    workout: next.workout,
    cardio: next.cardio,
    supplements: next.supplements,
    sleep: next.sleep,
    previousWorkoutDays: labeledDayCount(input.plan?.workout_plan ?? ''),
    previousWorkout: input.plan?.workout_plan,
    previousNutrition: input.plan?.nutrition_plan,
    changed,
    instruction: input.update.instruction,
  })
  if (errors.length === 0) {
    errors = await constraintFailures({
      constraints: input.constraints,
      instruction: input.update.instruction,
      next,
      changed,
    })
  }
  return { next, errors }
}

async function publishUpdate(input: {
  admin: Admin
  clientId: string
  coachId: string
  plan: ActivePlan | null
  next: Record<PlannerSection, string>
  clientNote: string
  requestId: string | null
  sleep: string | null
}): Promise<{ planId: string; previousPlanId: string | null } | { error: string }> {
  const note = input.clientNote.trim() || 'Your plan has been updated. Open My Plan for the new version.'
  const sleep = input.sleep?.trim()
  const coachNotes = sleep ? `${note}\n\n${sleep}` : note
  const saved = await persistAiPlanDraft(input.admin, {
    clientId: input.clientId,
    coachId: input.coachId,
    title: 'Planner update',
    form: {
      client_id: input.clientId,
      title: input.plan?.title?.trim() || 'Coaching Plan',
      phase: input.plan?.phase ?? '',
      nutrition_plan: input.next.nutrition,
      workout_plan: input.next.workout,
      cardio_plan: input.next.cardio,
      supplement_plan: input.next.supplements,
      coach_notes: coachNotes,
    },
  })
  if (saved.error || !saved.data) return { error: saved.error ?? 'Could not save the plan' }
  const previousPlanId = input.plan?.id ?? null
  const activated = await activatePlan(input.admin, {
    id: saved.data.id,
    client_id: input.clientId,
    coach_id: input.coachId,
  })
  if (activated.error) return { error: activated.error }

  let requestId = input.requestId
  if (!requestId) {
    const { data } = await input.admin
      .from('plan_change_requests')
      .select('id')
      .eq('client_id', input.clientId)
      .eq('coach_id', input.coachId)
      .eq('status', 'awaiting_planner')
      .order('locked_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    requestId = data?.id ?? null
  }
  if (requestId) {
    const now = new Date().toISOString()
    await input.admin
      .from('plan_change_requests')
      .update({
        status: 'approved',
        draft_plan_id: saved.data.id,
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', requestId)
      .eq('status', 'awaiting_planner')
  }
  return { planId: saved.data.id, previousPlanId }
}

export type PlannerThread = {
  messages: PlannerMessageRow[]
  activePlanId: string | null
  canRestorePrevious: boolean
}

async function threadState(admin: Admin, clientId: string, messages: PlannerMessageRow[]): Promise<PlannerThread> {
  const { data: active } = await admin
    .from('plans')
    .select('id')
    .eq('client_id', clientId)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  let canRestorePrevious = false
  if (active?.id) {
    const { data: activeRow } = await admin
      .from('plans')
      .select('delivered_at')
      .eq('id', active.id)
      .maybeSingle()
    const deliveredAt = activeRow?.delivered_at as string | null
    if (deliveredAt) {
      const { data: earlier } = await admin
        .from('plans')
        .select('id')
        .eq('client_id', clientId)
        .neq('id', active.id)
        .not('delivered_at', 'is', null)
        .lt('delivered_at', deliveredAt)
        .limit(1)
        .maybeSingle()
      canRestorePrevious = Boolean(earlier?.id)
    }
  }
  return { messages, activePlanId: (active?.id as string | undefined) ?? null, canRestorePrevious }
}

export async function seedPlannerCheckin(
  admin: Admin,
  input: { clientId: string; coachId: string; checkinId: string }
): Promise<void> {
  const marker = checkinBriefMarker(input.checkinId)
  const { data: existing } = await admin
    .from('client_planner_messages')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('role', 'request')
    .like('content', `${marker}%`)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return

  const { data: checkin } = await admin
    .from('checkins')
    .select(
      'id, client_id, coach_id, coaching_week, weight, diet_adherence, workout_adherence, energy_level, sleep_quality, stress_level, pain_injuries, questions_for_coach'
    )
    .eq('id', input.checkinId)
    .eq('client_id', input.clientId)
    .eq('coach_id', input.coachId)
    .maybeSingle()
  if (!checkin) return

  await insertMessage(admin, {
    clientId: input.clientId,
    coachId: input.coachId,
    role: 'request',
    content: formatPlannerCheckinBrief({
      checkinId: checkin.id,
      coachingWeek: checkin.coaching_week,
      weight: checkin.weight,
      dietAdherence: checkin.diet_adherence,
      workoutAdherence: checkin.workout_adherence,
      energyLevel: checkin.energy_level,
      sleepQuality: checkin.sleep_quality,
      stressLevel: checkin.stress_level,
      painInjuries: checkin.pain_injuries,
      questions: checkin.questions_for_coach,
    }),
  })

  const midWeek = await loadSameWeekMidWeekCheckin(admin, {
    id: checkin.id,
    client_id: checkin.client_id,
    coaching_week: checkin.coaching_week,
    checkin_type: 'weekly',
  })
  if (!midWeek) return
  const midMarker = midWeekBriefMarker(midWeek.id)
  const { data: existingMid } = await admin
    .from('client_planner_messages')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('role', 'request')
    .like('content', `${midMarker}%`)
    .limit(1)
    .maybeSingle()
  if (existingMid?.id) return
  await insertMessage(admin, {
    clientId: input.clientId,
    coachId: input.coachId,
    role: 'request',
    content: formatPlannerMidWeekBrief({
      checkinId: midWeek.id,
      coachingWeek: midWeek.coaching_week,
      dietAdherence: midWeek.diet_adherence,
      workoutAdherence: midWeek.workout_adherence,
      energyLevel: midWeek.energy_level,
      sleepQuality: midWeek.sleep_quality,
      stressLevel: midWeek.stress_level,
      wins: midWeek.adherence_wins,
      struggles: midWeek.adherence_struggles,
      painInjuries: midWeek.pain_injuries,
      questions: midWeek.questions_for_coach,
    }),
  })
}

export async function listPlannerThread(
  admin: Admin,
  input: { clientId: string; coachId: string; requestId?: string | null; checkinId?: string | null }
): Promise<PlannerThread> {
  if (input.requestId) {
    await seedPlannerRequest(admin, {
      clientId: input.clientId,
      coachId: input.coachId,
      requestId: input.requestId,
    })
  }
  if (input.checkinId) {
    await seedPlannerCheckin(admin, {
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
    })
  }
  return threadState(admin, input.clientId, await loadMessages(admin, input.clientId))
}

export async function restorePlannerPlan(input: {
  clientId: string
  coachId: string
  messageId: string
}): Promise<PlannerThread | { error: string; status: number }> {
  const admin = createAdminClient()
  const { data: message } = await admin
    .from('client_planner_messages')
    .select('id, published_plan_id')
    .eq('id', input.messageId)
    .eq('client_id', input.clientId)
    .eq('coach_id', input.coachId)
    .maybeSingle()
  const publishedId = message?.published_plan_id as string | null
  if (!publishedId) return { error: 'That message did not publish a plan.', status: 400 }

  const { data: active } = await admin
    .from('plans')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  if (active?.id !== publishedId) {
    return { error: 'That version is no longer the live plan.', status: 409 }
  }

  const { data: published } = await admin
    .from('plans')
    .select('delivered_at')
    .eq('id', publishedId)
    .maybeSingle()
  const deliveredAt = published?.delivered_at as string | null
  if (!deliveredAt) return { error: 'There is no earlier plan to put back.', status: 409 }

  const { data: previous } = await admin
    .from('plans')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('coach_id', input.coachId)
    .neq('id', publishedId)
    .not('delivered_at', 'is', null)
    .lt('delivered_at', deliveredAt)
    .order('delivered_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!previous?.id) return { error: 'There is no earlier plan to put back.', status: 409 }

  const activated = await activatePlan(admin, {
    id: previous.id,
    client_id: input.clientId,
    coach_id: input.coachId,
  })
  if (activated.error) return { error: activated.error, status: 500 }

  await insertMessage(admin, {
    clientId: input.clientId,
    coachId: input.coachId,
    role: 'assistant',
    content: 'Put the previous plan back. That version is live in My Plan again.',
    publishedPlanId: previous.id,
  })
  return threadState(admin, input.clientId, await loadMessages(admin, input.clientId))
}

async function returnFailedCheckToQueue(input: {
  admin: Admin
  clientId: string
  coachId: string
  planId: string | null
  requestId: string | null
  instruction: string
  sections: PlannerSection[]
  reason: string
}): Promise<boolean> {
  const now = new Date().toISOString()
  const errorMessage = input.reason.trim().slice(0, 500) || 'The plan check failed.'
  const requestText = input.instruction.trim().slice(0, 4000)
  const text = requestText.length >= 10 ? requestText : `Plan check failed. ${errorMessage}`.slice(0, 4000)
  const scope = plannerSectionsToScope(input.sections)

  const openQuery = input.admin
    .from('plan_change_requests')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('coach_id', input.coachId)
    .in('status', ['generating', 'draft_ready', 'in_review', 'awaiting_planner'])
    .order('locked_at', { ascending: false })
    .limit(1)
  const { data: open } = input.requestId
    ? await input.admin
        .from('plan_change_requests')
        .select('id')
        .eq('id', input.requestId)
        .eq('client_id', input.clientId)
        .maybeSingle()
    : await openQuery

  const openRow = Array.isArray(open) ? open[0] : open
  const existingId = (openRow?.id as string | undefined) ?? null
  if (existingId) {
    const { error } = await input.admin
      .from('plan_change_requests')
      .update({
        status: 'awaiting_planner',
        request_text: text,
        scope,
        error_message: errorMessage,
        active_plan_id: input.planId,
        locked_at: now,
        resolved_at: null,
        updated_at: now,
      })
      .eq('id', existingId)
    if (!error) return true
    console.error('[client-planner] queue update failed', error.message)
  }

  const { error: insertError } = await input.admin.from('plan_change_requests').insert({
    client_id: input.clientId,
    coach_id: input.coachId,
    active_plan_id: input.planId,
    request_text: text,
    scope,
    status: 'awaiting_planner',
    error_message: errorMessage,
    locked_at: now,
    created_at: now,
    updated_at: now,
  })
  if (!insertError) return true
  if (insertError.code === '23505') {
    const { data: raced } = await input.admin
      .from('plan_change_requests')
      .select('id')
      .eq('client_id', input.clientId)
      .eq('coach_id', input.coachId)
      .in('status', ['generating', 'draft_ready', 'in_review', 'awaiting_planner'])
      .order('locked_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!raced?.id) return false
    const { error } = await input.admin
      .from('plan_change_requests')
      .update({
        status: 'awaiting_planner',
        request_text: text,
        scope,
        error_message: errorMessage,
        locked_at: now,
        resolved_at: null,
        updated_at: now,
      })
      .eq('id', raced.id)
    return !error
  }
  console.error('[client-planner] queue insert failed', insertError.message)
  return false
}

export async function runPlannerTurn(input: {
  clientId: string
  coachId: string
  message: string
  requestId?: string | null
  checkinId?: string | null
}): Promise<PlannerThread | { error: string; status: number }> {
  const message = input.message.trim()
  if (!message) return { error: 'Write a message first.', status: 400 }
  if (message.length > MAX_COACH_MESSAGE) {
    return { error: 'Keep the message under 8000 characters.', status: 400 }
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', input.clientId)
    .eq('coach_id', input.coachId)
    .maybeSingle()
  if (!profile) return { error: 'Client not found', status: 404 }

  if (input.requestId) {
    await seedPlannerRequest(admin, {
      clientId: input.clientId,
      coachId: input.coachId,
      requestId: input.requestId,
    })
  }
  if (input.checkinId) {
    await seedPlannerCheckin(admin, {
      clientId: input.clientId,
      coachId: input.coachId,
      checkinId: input.checkinId,
    })
  }

  await insertMessage(admin, {
    clientId: input.clientId,
    coachId: input.coachId,
    role: 'coach',
    content: message,
  })

  const constraints = constraintBlock(profile as ClientProfile)
  let messages = await loadMessages(admin, input.clientId)
  try {
    messages = await compactIfNeeded(admin, input.clientId, input.coachId, messages, constraints)
  } catch (error) {
    console.error('[client-planner] summary failed', error)
  }

  const { data: plan } = await admin
    .from('plans')
    .select('id, title, phase, nutrition_plan, workout_plan, cardio_plan, supplement_plan, coach_notes')
    .eq('client_id', input.clientId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const active = (plan as ActivePlan | null) ?? null
  const systemPrompt = [
    'You are this client\'s planner. Only the coach is in this chat. The client cannot see it.',
    'Discuss the plan. Ask a short question when a required detail is missing.',
    'When the message is a finished client summary, or the coach has described the whole change, end the reply with this trailer and nothing after it. The plan is then written, checked, and delivered. Do not wait for a second confirmation. Do not publish from a fragment if they say more is coming:',
    '<<<PLANNER',
    '{"update":{"sections":["nutrition"],"instruction":"what to change, in the coach\'s words","clientNote":"one or two sentences the client will read"},"closeRequest":false}',
    '>>>',
    'sections may be nutrition, workout, cardio, supplements, and sleep. Include every section that must change.',
    'Cardio is a daily step count, such as 8000 steps.',
    'Do not put the full plan in the chat. The plan writer applies the platform diet and workout rules.',
    'If the coach names a workout difficulty or split, the written plan must use that. Never write a mixed gym-and-home week. An intermediate or advanced client does not get a light beginner week unless the coach chose easier.',
    'If the coach is still deciding, omit the trailer.',
    'If the coach says not to change the plan, set closeRequest true and omit update.',
    'Never contradict the constraints below.',
    `Client: ${profile.name?.trim() || 'Client'}`,
    profile.fitness_goal ? `Goal: ${profile.fitness_goal}` : '',
    constraints ? `Constraints:\n${constraints}` : '',
    active
      ? `Current plan title: ${active.title || 'Coaching plan'}`
      : 'This client has no live plan yet. A publish creates the first one.',
    active?.nutrition_plan ? `Diet excerpt:\n${excerpt(active.nutrition_plan)}` : '',
    active?.workout_plan ? `Workout excerpt:\n${excerpt(active.workout_plan)}` : '',
    active?.cardio_plan ? `Cardio excerpt:\n${excerpt(active.cardio_plan)}` : '',
    active?.supplement_plan ? `Supplement excerpt:\n${excerpt(active.supplement_plan)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  let decisionText = 'I am here. Tell me what should change on this plan.'
  try {
    const result = await generateOpenAIResponse({
      systemPrompt,
      userPrompt: [
        modelTranscript(messages),
        message.startsWith('Client summary of the full edit.')
          ? 'This message is the complete client edit. Include the PLANNER trailer now and cover every numbered point. Do not ask a follow-up.'
          : 'If the coach described what to change, include the PLANNER trailer. If they are only asking a question, omit it.',
        'Write the next reply to the coach.',
      ].join('\n\n'),
      model: MODELS.GPT_LUNA,
      maxTokens: 1200,
      temperature: 0.4,
    })
    decisionText = result.text.trim() || decisionText
  } catch (error) {
    console.error('[client-planner] reply failed', error)
    const saved = await insertMessage(admin, {
      clientId: input.clientId,
      coachId: input.coachId,
      role: 'assistant',
      content: 'I could not reply just now. Send that again in a moment.',
    })
    return threadState(admin, input.clientId, [...messages, saved])
  }

  let decision = parsePlannerDecision(decisionText)
  if (message.startsWith('Client summary of the full edit.') && !decision.update && !decision.closeRequest) {
    const scope = inferPlanChangeScope(message)
    const sections: PlannerSection[] =
      scope === 'diet' ? ['nutrition'] : scope === 'workout' ? ['workout'] : ['nutrition', 'workout']
    decision = {
      reply: decision.reply || 'Applying the full list.',
      closeRequest: false,
      update: {
        sections,
        instruction: message,
        clientNote: 'Your requested plan edit is in. Open My Plan.',
      },
    }
  }
  let reply = decision.reply
  let publishedPlanId: string | null = null

  if (decision.closeRequest && !decision.update) {
    const now = new Date().toISOString()
    await admin
      .from('plan_change_requests')
      .update({ status: 'declined', resolved_at: now, updated_at: now })
      .eq('client_id', input.clientId)
      .eq('coach_id', input.coachId)
      .eq('status', 'awaiting_planner')
    reply = `${reply}\n\nLeft the live plan as it is and cleared this request from the queue.`
  }

  if (decision.update) {
    let attemptErrors: string[] = []
    let drafted: Record<PlannerSection, string> | null = null
    try {
      for (let attempt = 0; attempt < MAX_PLAN_ATTEMPTS; attempt += 1) {
        const result = await applyUpdate({
          update: decision.update,
          attemptErrors,
          plan: active,
          profile: profile as ClientProfile,
          constraints,
        })
        drafted = result.next
        attemptErrors = result.errors
        if (attemptErrors.length === 0) break
      }
    } catch (error) {
      console.error('[client-planner] rewrite failed', error)
      attemptErrors = [error instanceof Error ? error.message : 'The plan rewrite failed.']
      drafted = null
    }

    if (drafted && attemptErrors.length === 0) {
      const published = await publishUpdate({
        admin,
        clientId: input.clientId,
        coachId: input.coachId,
        plan: active,
        next: drafted,
        clientNote: decision.update.clientNote,
        requestId: input.requestId ?? null,
        sleep: decision.update.sections.includes('sleep') ? drafted.sleep : null,
      })
      if ('planId' in published) {
        publishedPlanId = published.planId
        reply = published.previousPlanId
          ? `${reply}\n\nPublished. The client can open My Plan and see this version. You can put the previous plan back from this message.`
          : `${reply}\n\nPublished. The client can open My Plan and see this version.`
      } else {
        reply = `${reply}\n\nThe check passed, but the plan did not go live: ${published.error}`
      }
    } else {
      const reason = attemptErrors.join(' ') || 'The plan check failed.'
      const queued = await returnFailedCheckToQueue({
        admin,
        clientId: input.clientId,
        coachId: input.coachId,
        planId: active?.id ?? null,
        requestId: input.requestId ?? null,
        instruction: decision.update.instruction,
        sections: decision.update.sections,
        reason,
      })
      reply = queued
        ? `${reply}\n\nI did not publish. The plan still failed its check after 3 tries: ${reason} It is back on your queue.`
        : `${reply}\n\nI did not publish. The plan still failed its check after 3 tries: ${reason}`
    }
  }

  const saved = await insertMessage(admin, {
    clientId: input.clientId,
    coachId: input.coachId,
    role: 'assistant',
    content: reply.trim(),
    publishedPlanId,
  })
  const latest = await loadMessages(admin, input.clientId)
  return threadState(admin, input.clientId, latest.length > 0 ? latest : [...messages, saved])
}

/** The client's chat summary is the whole edit. Check it and publish. */
export async function runPlannerFromClientSummary(input: {
  clientId: string
  coachId: string
  requestId: string
  summary: string
}): Promise<void> {
  const admin = createAdminClient()
  await seedPlannerRequest(admin, {
    clientId: input.clientId,
    coachId: input.coachId,
    requestId: input.requestId,
  })
  await runPlannerTurn({
    clientId: input.clientId,
    coachId: input.coachId,
    requestId: input.requestId,
    message: `Client summary of the full edit. Apply every point, check the plan, and publish. Do not ask for the rest of the message.\n\n${input.summary}`,
  })
}
