import type { GeneratedPlan } from '@/lib/ai/generate-plan'
import { applyParsedSectionsToFormData } from '@/lib/plan-section-parser'
import type { PlanFormData } from '@/types/database'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Remove common AI/Markdown decoration while preserving normal punctuation. */
export function normalizeAiPlanProse(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^\s*[-*_]{3,}\s*$/.test(line)) return ''
      return line
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(/^\s*[-*•–—]\s+/, '')
        .replace(/\*+/g, '')
        .replace(/_{2,}/g, '')
        .trimEnd()
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatScalar(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(formatScalar).filter(Boolean).join(', ')
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${formatScalar(v)}`)
      .join(' · ')
  }
  return String(value)
}

function formatBulletLines(items: unknown[], indent = '  • '): string {
  return items
    .map((item) => {
      const line = formatScalar(item)
      return line ? `${indent}${line}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function formatWorkoutDays(days: unknown[]): string {
  if (days.length === 0) return ''

  return days
    .map((day) => {
      if (!isRecord(day)) return formatScalar(day)

      const heading = [day.day, day.name, day.focus, day.title]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .join(' — ')

      const exercises = day.exercises ?? day.movements ?? day.lifts
      const exerciseBlock = Array.isArray(exercises) ? formatBulletLines(exercises) : ''

      const notes = typeof day.notes === 'string' ? day.notes.trim() : ''
      const extra = notes ? `  Note: ${notes}` : ''

      return [heading, exerciseBlock, extra].filter(Boolean).join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

function formatMeals(meals: unknown[]): string {
  if (meals.length === 0) return ''

  return meals
    .map((meal) => {
      if (!isRecord(meal)) return formatScalar(meal)

      const labelKeys = ['meal_name', 'meal', 'time', 'name', 'title', 'label', 'type'] as const
      let name = 'Meal'
      let detail: unknown =
        meal.example ??
        meal.description ??
        meal.foods ??
        meal.items ??
        meal.options ??
        meal.content

      for (const key of labelKeys) {
        const value = meal[key]
        if (typeof value !== 'string' || !value.trim()) continue
        if (value.length <= 40 && !value.includes(',')) {
          name = value.trim()
        } else if (!detail) {
          detail = value
        }
      }

      if (typeof detail === 'string' && detail.trim()) {
        return `${name}: ${detail.trim()}`
      }
      if (Array.isArray(detail)) {
        const text = detail.map(formatScalar).filter(Boolean).join(', ')
        return text ? `${name}: ${text}` : name
      }
      if (isRecord(detail)) {
        const text = formatScalar(detail)
        return text ? `${name}: ${text}` : name
      }

      const macros = [meal.calories, meal.protein, meal.carbs, meal.fat]
        .map((v) => (typeof v === 'number' ? v : null))
        .filter((v) => v != null)
      if (macros.length > 0) {
        return `${name} (${macros.join(' / ')})`
      }

      const fallback = Object.entries(meal)
        .filter(([k]) => !['meal', 'name', 'title'].includes(k))
        .map(([, v]) => formatScalar(v))
        .filter(Boolean)
        .join(' · ')

      return fallback ? `${name}: ${fallback}` : name
    })
    .filter(Boolean)
    .join('\n')
}

function formatCardioSessions(sessions: unknown[]): string {
  if (sessions.length === 0) return ''

  return sessions
    .map((session) => {
      if (!isRecord(session)) return formatScalar(session)

      const type =
        (typeof session.type === 'string' && session.type) ||
        (typeof session.name === 'string' && session.name) ||
        'Session'

      const parts = [
        typeof session.duration === 'string' ? session.duration : null,
        typeof session.frequency === 'string' ? session.frequency : null,
        typeof session.intensity === 'string' ? session.intensity : null,
        typeof session.notes === 'string' ? session.notes : null,
      ].filter(Boolean)

      return parts.length > 0 ? `${type} — ${parts.join(' · ')}` : type
    })
    .filter(Boolean)
    .join('\n')
}

function formatSupplementItems(items: unknown[]): string {
  if (items.length === 0) return ''

  return items
    .map((item) => {
      if (!isRecord(item)) return formatScalar(item)

      const name =
        (typeof item.name === 'string' && item.name) ||
        (typeof item.supplement === 'string' && item.supplement) ||
        'Supplement'

      const dose =
        (typeof item.dose === 'string' && item.dose) ||
        (typeof item.dosage === 'string' && item.dosage) ||
        (typeof item.amount === 'string' && item.amount) ||
        ''

      const notes = typeof item.notes === 'string' ? item.notes.trim() : ''

      const parts = [dose, notes].filter(Boolean)
      return parts.length > 0 ? `${name} — ${parts.join(' · ')}` : name
    })
    .filter(Boolean)
    .join('\n')
}

/** Map validated AI JSON into plan editor / DB text fields. */
export function generatedPlanToFormData(
  generated: GeneratedPlan,
  clientId: string,
  options?: { title?: string; phase?: string }
): PlanFormData {
  const workoutDays = formatWorkoutDays(generated.workout_plan.days)
  const workoutText = [generated.workout_plan.overview, workoutDays ? `\n${workoutDays}` : '']
    .join('')
    .trim()

  const mealsText = formatMeals(generated.nutrition_plan.meals)
  const nutritionText = normalizeAiPlanProse(
    [
      `Calories: ${generated.nutrition_plan.calories}`,
      `Protein: ${generated.nutrition_plan.protein}g`,
      `Carbs: ${generated.nutrition_plan.carbs}g`,
      `Fat: ${generated.nutrition_plan.fat}g`,
      mealsText ? '' : null,
      mealsText || null,
    ]
      .filter((line) => line !== null)
      .join('\n')
  )

  return applyParsedSectionsToFormData({
    client_id: clientId,
    title: options?.title ?? 'AI Coaching Plan (Draft)',
    phase: options?.phase ?? 'Phase 1',
    workout_plan: normalizeAiPlanProse(workoutText),
    nutrition_plan: nutritionText,
    cardio_plan: normalizeAiPlanProse(formatCardioSessions(generated.cardio_plan.sessions)),
    supplement_plan: normalizeAiPlanProse(formatSupplementItems(generated.supplement_plan.items)),
    coach_notes: normalizeAiPlanProse(generated.coach_notes),
  })
}

export function generatedDietFormData(generated: GeneratedPlan, clientId: string): PlanFormData {
  const full = generatedPlanToFormData(generated, clientId, { title: 'Diet Plan (Draft)' })
  return {
    ...full,
    workout_plan: '',
  }
}

export function generatedWorkoutFormData(generated: GeneratedPlan, clientId: string): PlanFormData {
  const full = generatedPlanToFormData(generated, clientId, { title: 'Workout Plan (Draft)' })
  return {
    ...full,
    nutrition_plan: '',
    supplement_plan: '',
  }
}

export const PLAN_DRAFT_STORAGE_PREFIX = 'coach-plan-draft-'
export const AI_REASONING_STORAGE_PREFIX = 'coach-ai-reasoning-'
export const WORKOUT_RETRY_ERROR_PREFIX = 'coach-workout-retry-error-'

export function saveAiReasoningToSession(clientId: string, reasoning: unknown): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(`${AI_REASONING_STORAGE_PREFIX}${clientId}`, JSON.stringify(reasoning))
}

export function loadAiReasoningFromSession<T>(clientId: string): T | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(`${AI_REASONING_STORAGE_PREFIX}${clientId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function saveWorkoutRetryError(clientId: string, message: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(`${WORKOUT_RETRY_ERROR_PREFIX}${clientId}`, message)
}

export function loadWorkoutRetryError(clientId: string): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(`${WORKOUT_RETRY_ERROR_PREFIX}${clientId}`)
}

export function clearWorkoutRetryError(clientId: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(`${WORKOUT_RETRY_ERROR_PREFIX}${clientId}`)
}

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
