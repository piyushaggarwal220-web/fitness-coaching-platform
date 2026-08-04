import type { WorkoutEnvironment } from '@/lib/ai/workout-prompt-selection'

type CompletenessPlan = {
  workout_plan: {
    overview: string
    days: unknown[]
  }
  nutrition_plan: {
    meals: unknown[]
  }
}

type CompletenessMode =
  | 'full'
  | 'workout_focus'
  | 'nutrition_focus'
  | 'cardio_focus'
  | 'supplements_focus'
  | 'minimal'

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

const DAY_HEADER_RE =
  /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?(?:(day\s*\d+)|(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi

export type PlanCompletenessOptions = {
  mode: CompletenessMode
  expectedTrainingDays?: number | null
  workoutEnvironment?: WorkoutEnvironment
}

export type PlanCompletenessResult = {
  ok: boolean
  error: string | null
  dietDayCount: number
  workoutDayCount: number
  dietDays: string[]
  workoutDays: string[]
}

/** Collect unique day labels (weekday or day N) from plan prose. */
export function extractPlanDayLabels(text: string): string[] {
  if (!text?.trim()) return []
  const found = new Set<string>()
  const re = new RegExp(DAY_HEADER_RE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const token = (match[1] || match[2] || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (!token) continue
    found.add(token)
  }
  return [...found]
}

function dietProseFromPlan(plan: CompletenessPlan): string {
  const parts: string[] = []
  for (const meal of plan.nutrition_plan.meals) {
    if (!meal || typeof meal !== 'object') continue
    const row = meal as Record<string, unknown>
    for (const key of ['example', 'description', 'content', 'meal'] as const) {
      const value = row[key]
      if (typeof value === 'string' && value.trim()) parts.push(value)
    }
  }
  return parts.join('\n')
}

function workoutProseFromPlan(plan: CompletenessPlan): string {
  const parts = [plan.workout_plan.overview]
  for (const day of plan.workout_plan.days) {
    if (!day || typeof day !== 'object') continue
    const row = day as Record<string, unknown>
    for (const key of ['day', 'name', 'title', 'focus', 'overview'] as const) {
      const value = row[key]
      if (typeof value === 'string' && value.trim()) parts.push(value)
    }
    if (Array.isArray(row.exercises)) {
      parts.push(row.exercises.map(String).join('\n'))
    }
  }
  return parts.filter(Boolean).join('\n')
}

export function resolveExpectedTrainingDays(
  daysPerWeek: string | number | null | undefined,
  environment: WorkoutEnvironment
): number {
  if (environment === 'home') return 7
  const n =
    typeof daysPerWeek === 'number'
      ? daysPerWeek
      : Number.parseInt(String(daysPerWeek ?? '').replace(/[^\d]/g, ''), 10)
  if (Number.isFinite(n) && n >= 1 && n <= 7) return n
  return 4
}

/**
 * Reject incomplete diet/workout weeks before they reach clients.
 * Diet must explicitly label all 7 days. Gym workouts must cover training days/week.
 */
export function assessPlanCompleteness(
  plan: CompletenessPlan,
  options: PlanCompletenessOptions
): PlanCompletenessResult {
  const mode = options.mode
  const dietDays = extractPlanDayLabels(dietProseFromPlan(plan))
  const workoutFromProse = extractPlanDayLabels(workoutProseFromPlan(plan))
  const workoutFromArray = plan.workout_plan.days
    .map((day) => {
      if (!day || typeof day !== 'object') return null
      const label = (day as Record<string, unknown>).day
      return typeof label === 'string' ? label.toLowerCase().trim() : null
    })
    .filter((v): v is string => Boolean(v))
  const workoutDays = [...new Set([...workoutFromProse, ...workoutFromArray])]

  const needsDiet = mode === 'full' || mode === 'nutrition_focus'
  const needsWorkout = mode === 'full' || mode === 'workout_focus'

  if (needsDiet) {
    const weekdaysFound = WEEKDAYS.filter((d) => dietDays.includes(d))
    const dayNFound = dietDays.filter((d) => /^day\s*\d+$/.test(d))
    const completeByWeekday = weekdaysFound.length >= 7
    const completeByDayN = dayNFound.length >= 7
    if (!completeByWeekday && !completeByDayN) {
      const found = dietDays.length > 0 ? dietDays.join(', ') : 'none'
      return {
        ok: false,
        error: `Diet plan is incomplete: need all 7 days labeled Day 1 to Day 7. Found: ${found}.`,
        dietDayCount: Math.max(weekdaysFound.length, dayNFound.length),
        workoutDayCount: workoutDays.length,
        dietDays,
        workoutDays,
      }
    }
  }

  if (needsWorkout) {
    const expected = resolveExpectedTrainingDays(
      options.expectedTrainingDays,
      options.workoutEnvironment ?? 'gym'
    )
    const structuredCount = plan.workout_plan.days.length
    const labeledCount = workoutDays.length
    const covered = Math.max(structuredCount, labeledCount)
    if (covered < expected) {
      return {
        ok: false,
        error: `Workout plan is incomplete: need ${expected} training day${expected === 1 ? '' : 's'} (got ${covered}). Label each day clearly as Day 1, Day 2, ….`,
        dietDayCount: dietDays.length,
        workoutDayCount: covered,
        dietDays,
        workoutDays,
      }
    }
  }

  return {
    ok: true,
    error: null,
    dietDayCount: dietDays.length,
    workoutDayCount: workoutDays.length,
    dietDays,
    workoutDays,
  }
}
