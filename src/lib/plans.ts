import type { SupabaseClient } from '@supabase/supabase-js'
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

  const { error } = await supabase
    .from('profiles')
    .update({ plan_delivered: (count ?? 0) > 0 })
    .eq('id', clientId)

  return { error: error?.message ?? null }
}

export async function activatePlan(
  supabase: SupabaseClient,
  plan: Pick<Plan, 'id' | 'client_id'>
): Promise<{ error: string | null }> {
  const { error: deactivateError } = await supabase
    .from('plans')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('client_id', plan.client_id)
    .neq('id', plan.id)

  if (deactivateError) return { error: deactivateError.message }

  const { error } = await supabase
    .from('plans')
    .update({
      active: true,
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id)

  if (error) return { error: error.message }

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

export function planToForm(plan: Plan): PlanFormData {
  return {
    client_id: plan.client_id,
    title: plan.title,
    phase: plan.phase ?? '',
    workout_plan: plan.workout_plan ?? '',
    nutrition_plan: plan.nutrition_plan ?? '',
    cardio_plan: plan.cardio_plan ?? '',
    supplement_plan: plan.supplement_plan ?? '',
    coach_notes: plan.coach_notes ?? '',
  }
}
