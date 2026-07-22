import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidateForEvent } from '@/lib/ai/prompt-cache'
import { getNextCoachingDayStart } from '@/lib/checkin-schedule'
import {
  clientCoachNotes,
  formatPublishedPlanTitle,
  isAiDraftTitle,
  prepareCoachNotesForPublish,
} from '@/lib/plan-metadata'
import type { Plan, PlanFormData } from '@/types/database'

export const INITIAL_PLAN_FORM: PlanFormData = {
  client_id: '',
  title: 'Coaching Plan',
  phase: '',
  workout_plan: '',
  nutrition_plan: '',
  cardio_plan: '',
  supplement_plan: '',
  coach_notes: '',
}

export const AI_DRAFT_DELIVERY_STATE = {
  active: false,
  delivered_at: null,
} as const

export function hasAuthoritativeOnboardingCompletion(profile: {
  onboarding_complete?: boolean | null
} | null): boolean {
  return profile?.onboarding_complete === true
}

export function validatePlanForm(data: PlanFormData): string | null {
  if (!data.client_id) return 'Please select a client.'
  if (!data.title.trim()) return 'Plan title is required.'
  if (!data.workout_plan.trim() && !data.nutrition_plan.trim()) {
    return 'Add at least a workout or nutrition plan.'
  }
  return null
}

export function formatPlanDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export async function getNextPlanVersion(
  supabase: SupabaseClient,
  clientId: string
): Promise<number> {
  const { data } = await supabase
    .from('plans')
    .select('version')
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.version ?? 0) + 1
}

export async function syncPlanDeliveredFlag(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ error: string | null }> {
  const { count, error: countError } = await supabase
    .from('plans')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('active', true)

  if (countError) return { error: countError.message }

  const { data: firstDeliveredPlan, error: deliveryError } = await supabase
    .from('plans')
    .select('delivered_at')
    .eq('client_id', clientId)
    .not('delivered_at', 'is', null)
    .order('delivered_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (deliveryError) return { error: deliveryError.message }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('checkin_schedule_started_at')
    .eq('id', clientId)
    .maybeSingle()

  if (profileError) return { error: profileError.message }

  const firstDelivery = firstDeliveredPlan?.delivered_at ?? null
  const scheduleStartedAt = profile?.checkin_schedule_started_at ??
    (firstDelivery ? getNextCoachingDayStart(firstDelivery).toISOString() : null)
  const { error } = await supabase
    .from('profiles')
    .update({
      plan_delivered: (count ?? 0) > 0,
      checkin_schedule_started_at: scheduleStartedAt,
    })
    .eq('id', clientId)

  return { error: error?.message ?? null }
}

export async function activatePlan(
  supabase: SupabaseClient,
  plan: Pick<Plan, 'id' | 'client_id' | 'coach_id'>
): Promise<{ error: string | null }> {
  const { data: client, error: clientError } = await supabase
    .from('profiles')
    .select('onboarding_complete, onboarding_completed_at, terms_accepted_at, coach_id')
    .eq('id', plan.client_id)
    .maybeSingle()

  if (clientError) return { error: clientError.message }
  if (!client) {
    return { error: 'Cannot deliver plan: client profile could not be verified.' }
  }
  if (!client.coach_id) {
    return { error: 'Cannot deliver plan: client has no assigned coach.' }
  }
  if (client.coach_id !== plan.coach_id) {
    return { error: 'Cannot deliver plan: plan coach does not match assigned coach.' }
  }

  const { data: fullPlan, error: planError } = await supabase
    .from('plans')
    .select('id, title, coach_notes, phase')
    .eq('id', plan.id)
    .maybeSingle()

  if (planError) return { error: planError.message }
  if (!fullPlan) return { error: 'Plan not found.' }

  const { notes: publishNotes, error: notesError } = prepareCoachNotesForPublish(fullPlan.coach_notes)
  if (notesError) return { error: notesError }

  const { count: activeCount, error: activeCountError } = await supabase
    .from('plans')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', plan.client_id)
    .eq('active', true)
    .neq('id', plan.id)

  if (activeCountError) return { error: activeCountError.message }

  const isUpdate = (activeCount ?? 0) > 0
  const publishedTitle = isAiDraftTitle(fullPlan.title)
    ? formatPublishedPlanTitle(fullPlan, isUpdate)
    : fullPlan.title.trim()

  const { error: deactivateError } = await supabase
    .from('plans')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('client_id', plan.client_id)
    .neq('id', plan.id)

  if (deactivateError) return { error: deactivateError.message }

  const deliveredAt = new Date().toISOString()
  const { error } = await supabase
    .from('plans')
    .update({
      active: true,
      title: publishedTitle,
      coach_notes: publishNotes,
      delivered_at: deliveredAt,
      updated_at: deliveredAt,
    })
    .eq('id', plan.id)

  if (error) return { error: error.message }

  void invalidateForEvent('plan_activated', plan.client_id)
  return syncPlanDeliveredFlag(supabase, plan.client_id)
}

export async function deactivatePlan(
  supabase: SupabaseClient,
  plan: Pick<Plan, 'id' | 'client_id'>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('plans')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', plan.id)

  if (error) return { error: error.message }

  return syncPlanDeliveredFlag(supabase, plan.client_id)
}

export function invalidatePlanEdit(clientId: string): void {
  void invalidateForEvent('plan_edited', clientId)
}

export function planToForm(plan: Plan): PlanFormData {
  return {
    client_id: plan.client_id,
    title: plan.title,
    phase: plan.phase ?? '',
    workout_plan: plan.workout_plan ?? '',
    nutrition_plan: plan.nutrition_plan ?? '',
    cardio_plan: plan.cardio_plan ?? '',
    supplement_plan: plan.supplement_plan ?? '',
    coach_notes: clientCoachNotes(plan.coach_notes),
  }
}

/** Copy a plan into a new draft version without modifying the source. */
export async function restorePlanAsDraft(
  supabase: SupabaseClient,
  plan: Plan
): Promise<{ data: Plan | null; error: string | null }> {
  const version = await getNextPlanVersion(supabase, plan.client_id)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('plans')
    .insert({
      client_id: plan.client_id,
      coach_id: plan.coach_id,
      title: `${plan.title} (restored v${plan.version})`,
      phase: plan.phase,
      workout_plan: plan.workout_plan,
      nutrition_plan: plan.nutrition_plan,
      cardio_plan: plan.cardio_plan,
      supplement_plan: plan.supplement_plan,
      coach_notes: plan.coach_notes,
      version,
      ...AI_DRAFT_DELIVERY_STATE,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to restore plan' }
  return { data: data as Plan, error: null }
}

/**
 * Persist an AI-generated plan as an inactive server draft so refresh/timeout
 * does not lose completed LLM work sitting only in sessionStorage.
 */
export async function persistAiPlanDraft(
  supabase: SupabaseClient,
  input: {
    clientId: string
    coachId: string
    form: PlanFormData
    title?: string
  }
): Promise<{ data: Plan | null; error: string | null }> {
  const version = await getNextPlanVersion(supabase, input.clientId)
  const now = new Date().toISOString()
  const titleBase = input.title?.trim() || input.form.title.trim() || 'Initial Plan'
  const title = titleBase.startsWith('AI Draft') ? titleBase : `AI Draft · ${titleBase}`

  const { data, error } = await supabase
    .from('plans')
    .insert({
      client_id: input.clientId,
      coach_id: input.coachId,
      title,
      phase: input.form.phase.trim() || null,
      workout_plan: input.form.workout_plan.trim() || null,
      nutrition_plan: input.form.nutrition_plan.trim() || null,
      cardio_plan: input.form.cardio_plan.trim() || null,
      supplement_plan: input.form.supplement_plan.trim() || null,
      coach_notes: input.form.coach_notes.trim() || null,
      version,
      ...AI_DRAFT_DELIVERY_STATE,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to save AI draft' }
  return { data: data as Plan, error: null }
}

