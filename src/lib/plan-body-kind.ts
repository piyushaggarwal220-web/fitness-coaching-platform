/**
 * Tell a diet plan from a workout plan by the text itself.
 * Section headers are not enough: a workout field sometimes holds a full diet,
 * and a diet field sometimes opens with a training schedule.
 */

export type PlanBodyKind = 'diet' | 'workout' | 'mixed' | 'unclear'

const DIET_HEADER =
  /^(?:weekly\s+|daily\s+)?(?:diet|meal|nutrition|food)(?:\s+plan)?\s*:?\s*$/i
const MEAL_LINE =
  /^(?:breakfast|lunch|dinner|snack|mid[-\s]?morning|evening snack)\b/i
const WORKOUT_HEADER =
  /^(?:weekly\s+)?(?:workout|training)(?:\s+plan|\s+schedule)?\s*:?\s*$/i
const WORKOUT_PHASE = /^(?:warm[\s-]?up\s*:|main workout\s*:)/i
const DAY_HEADER =
  /^(?:day\s*\d+\b|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i
const SETS_LINE = /\d+\s*sets?\s*[x×]\s*\d+/i

function cleanLine(line: string): string {
  return line
    .trim()
    .replace(/^[*_#]+/, '')
    .replace(/[*_]+$/, '')
    .trim()
}

function isDayHeader(line: string): boolean {
  return DAY_HEADER.test(cleanLine(line))
}

/** A post-workout shake is a meal. Only warm-up and main-workout labels start a session. */
function lineSignal(line: string): 'diet' | 'workout' | null {
  const trimmed = cleanLine(line)
  if (!trimmed) return null
  if (DIET_HEADER.test(trimmed) || MEAL_LINE.test(trimmed)) return 'diet'
  if (WORKOUT_HEADER.test(trimmed) || WORKOUT_PHASE.test(trimmed) || SETS_LINE.test(trimmed)) {
    return 'workout'
  }
  return null
}

export function scorePlanText(text: string): { diet: number; workout: number } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let diet = 0
  let workout = 0
  for (const line of lines) {
    const signal = lineSignal(line)
    if (signal === 'diet') diet += DIET_HEADER.test(cleanLine(line)) ? 3 : 2
    if (signal === 'workout') workout += SETS_LINE.test(line) ? 1 : 3
  }
  if (/\bdaily total\b/i.test(text)) diet += 2
  return { diet, workout: Math.min(workout, 12) }
}

export function classifyPlanText(text: string | null | undefined): PlanBodyKind {
  const value = text?.trim() ?? ''
  if (!value) return 'unclear'
  const { diet, workout } = scorePlanText(value)
  if (diet >= 4 && workout >= 4) return 'mixed'
  if (diet >= 4 && diet > workout) return 'diet'
  if (workout >= 4 && workout > diet) return 'workout'
  return 'unclear'
}

/** Split mixed prose into the meal block and the training block. */
export function partitionPlanText(text: string): { diet: string; workout: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let mode: 'diet' | 'workout' | null = null
  const diet: string[] = []
  const workout: string[] = []
  const preamble: string[] = []

  const push = (line: string) => {
    if (mode === 'diet') diet.push(line)
    else if (mode === 'workout') workout.push(line)
    else preamble.push(line)
  }

  // A day title can sit above the first lift. A food note above that title cannot.
  const takeSessionLeadIn = (bucket: string[]) => {
    const moved: string[] = []
    while (bucket.length > 0) {
      const last = bucket[bucket.length - 1] ?? ''
      const trimmed = cleanLine(last)
      if (!trimmed) {
        moved.push(bucket.pop()!)
        continue
      }
      if (MEAL_LINE.test(trimmed) || DIET_HEADER.test(trimmed)) break
      if (/\b(kcal|calories|protein|daily total|option\s*\d)\b/i.test(trimmed)) break
      if (/\(\s*P\s*:/i.test(trimmed)) break
      const sessionTitle = trimmed.length <= 48 && !/[:.]/.test(trimmed) && !/\d/.test(trimmed)
      if (!isDayHeader(trimmed) && !sessionTitle) break
      moved.push(bucket.pop()!)
    }
    workout.push(...moved.reverse())
  }

  for (const line of lines) {
    const signal = lineSignal(line)
    if (signal && mode === null && preamble.length > 0) {
      if (signal === 'workout') {
        takeSessionLeadIn(preamble)
        if (preamble.length > 0) diet.push(...preamble)
      } else {
        diet.push(...preamble)
      }
      preamble.length = 0
    }
    if (signal === 'workout' && mode === 'diet') takeSessionLeadIn(diet)
    if (signal) mode = signal
    push(line)
  }

  return {
    diet: diet.join('\n').trim(),
    workout: workout.join('\n').trim(),
  }
}

/**
 * Put each block in the section it belongs to.
 * A second diet pasted into the workout field is dropped when the diet field
 * already has the meals. A training schedule pasted above the meals is dropped
 * from the diet when the workout field already has the sessions.
 */
export function separateSwappedPlanSections(
  dietIn: string,
  workoutIn: string
): { diet: string; workout: string } {
  let diet = dietIn.trim()
  let workout = workoutIn.trim()
  const dietClass = classifyPlanText(diet)
  const workoutClass = classifyPlanText(workout)

  if (dietClass === 'workout' && workoutClass === 'diet') {
    return { diet: workout, workout: diet }
  }

  if (dietClass === 'mixed' || dietClass === 'workout') {
    const parts = partitionPlanText(diet)
    const meals = classifyPlanText(parts.diet) === 'diet' ? parts.diet : ''
    const lifts = classifyPlanText(parts.workout) === 'workout' ? parts.workout : ''
    if (dietClass === 'mixed' && meals) diet = meals
    else if (dietClass === 'workout') diet = meals
    if (lifts && (workoutClass !== 'workout' || !workout)) workout = lifts
  }

  const workoutNow = classifyPlanText(workout)
  if (workoutNow === 'mixed' || workoutNow === 'diet') {
    const parts = partitionPlanText(workout)
    const meals = classifyPlanText(parts.diet) === 'diet' ? parts.diet : ''
    const lifts = classifyPlanText(parts.workout) === 'workout' ? parts.workout : ''
    if (lifts) workout = lifts
    else if (workoutNow === 'diet') workout = ''
    if (meals && (!diet || classifyPlanText(diet) === 'workout')) diet = meals
  }

  return { diet: diet.trim(), workout: workout.trim() }
}

/** Keep a section edit, or say why it is the other plan. */
export function sectionTextMismatch(
  section: 'nutrition' | 'workout',
  text: string
): { text: string } | { error: string } {
  const kind = classifyPlanText(text)
  if (section === 'workout') {
    if (kind === 'diet') {
      return {
        error:
          'This rewrite is a diet plan. Write only the workout: each day with Warm-up, Main Workout, and sets x reps. Do not write breakfast, lunch, dinner, or a diet plan.',
      }
    }
    if (kind === 'mixed') {
      const parts = partitionPlanText(text)
      if (classifyPlanText(parts.workout) === 'workout') return { text: parts.workout }
      return {
        error:
          'This rewrite mixes meals into the workout. Write the training sessions only, with sets x reps.',
      }
    }
    return { text }
  }

  if (kind === 'workout') {
    return {
      error:
        'This rewrite is a workout plan. Write only the diet: meals for Day 1 (Monday) through Day 7 (Sunday). Do not write sets, warm-ups, or a training schedule.',
    }
  }
  if (kind === 'mixed') {
    const parts = partitionPlanText(text)
    if (classifyPlanText(parts.diet) === 'diet') return { text: parts.diet }
    return {
      error:
        'This rewrite mixes a training schedule into the diet. Write the meals only.',
    }
  }
  return { text }
}
