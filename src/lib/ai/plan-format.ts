import type { GeneratedPlan } from '@/lib/ai/generate-plan'
import type { PlanFormData } from '@/types/database'

function formatSection(title: string, body: unknown): string {
  if (body == null) return ''
  if (typeof body === 'string') return body.trim()
  return JSON.stringify(body, null, 2)
}

/** Map validated AI JSON into plan editor / DB text fields. */
export function generatedPlanToFormData(
  generated: GeneratedPlan,
  clientId: string,
  options?: { title?: string; phase?: string }
): PlanFormData {
  const workoutText = [
    generated.workout_plan.overview,
    '',
    formatSection('Days', generated.workout_plan.days),
  ].join('\n').trim()

  const nutritionText = [
    `Calories: ${generated.nutrition_plan.calories}`,
    `Protein: ${generated.nutrition_plan.protein}g`,
    `Carbs: ${generated.nutrition_plan.carbs}g`,
    `Fat: ${generated.nutrition_plan.fat}g`,
    '',
    formatSection('Meals', generated.nutrition_plan.meals),
  ].join('\n')

  return {
    client_id: clientId,
    title: options?.title ?? 'AI Coaching Plan (Draft)',
    phase: options?.phase ?? 'Phase 1',
    workout_plan: workoutText,
    nutrition_plan: nutritionText,
    cardio_plan: formatSection('Cardio', generated.cardio_plan.sessions),
    supplement_plan: formatSection('Supplements', generated.supplement_plan.items),
    coach_notes: generated.coach_notes.trim(),
  }
}

export const PLAN_DRAFT_STORAGE_PREFIX = 'coach-plan-draft-'

export function savePlanDraftToSession(clientId: string, form: PlanFormData): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(`${PLAN_DRAFT_STORAGE_PREFIX}${clientId}`, JSON.stringify(form))
}

export function loadPlanDraftFromSession(clientId: string): PlanFormData | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(`${PLAN_DRAFT_STORAGE_PREFIX}${clientId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PlanFormData
  } catch {
    return null
  }
}

export function clearPlanDraftFromSession(clientId: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(`${PLAN_DRAFT_STORAGE_PREFIX}${clientId}`)
}
