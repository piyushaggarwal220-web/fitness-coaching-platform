import { resolvePlanSectionsFromPlan } from '@/lib/plan-section-parser'
import type { OnboardingProfile, Plan } from '@/types/database'
import type {
  MealMacros,
  TrackerCardioItem,
  TrackerCompletion,
  TrackerExerciseItem,
  TrackerMealItem,
  TrackerNoteItem,
  TrackerPeriod,
  TrackerSleepItem,
  TrackerSnapshot,
  TrackerSnapshotItem,
  TrackerSupplementItem,
  TrackerWaterItem,
  TrackerWorkoutItem,
  WorkoutExercisePhase,
  WorkoutPhaseBlock,
} from './types'
import { DEFAULT_WARMUP_EXERCISES, withTrackingMeta } from './exercise-utils'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

function parseMealMacros(text: string): { macros: MealMacros; cleaned: string } {
  const macros: MealMacros = {}
  let cleaned = text

  const kcalMatch = text.match(/(?:~|≈|about\s*)?(\d{2,4})\s*(?:kcal|calories?)/i)
  if (kcalMatch) macros.calories = Number(kcalMatch[1])

  const proteinMatch = text.match(/(?:P|Protein)[:\s]+(\d+)\s*g/i)
  if (proteinMatch) macros.protein = Number(proteinMatch[1])

  const carbsMatch = text.match(/(?:C|Carbs?)[:\s]+(\d+)\s*g/i)
  if (carbsMatch) macros.carbs = Number(carbsMatch[1])

  const fatMatch = text.match(/(?:F|Fat)[:\s]+(\d+)\s*g/i)
  if (fatMatch) macros.fat = Number(fatMatch[1])

  cleaned = cleaned
    .replace(/\(P:\s*\d+g\s*\|\s*C:\s*\d+g\s*\|\s*F:\s*\d+g\s*\|\s*~?\d+\s*kcal\)/gi, '')
    .replace(/(?:~|≈)?\d{2,4}\s*(?:kcal|calories?)/gi, '')
    .replace(/(?:P|Protein)[:\s]+\d+\s*g/gi, '')
    .replace(/(?:C|Carbs?)[:\s]+\d+\s*g/gi, '')
    .replace(/(?:F|Fat)[:\s]+\d+\s*g/gi, '')
    .trim()

  return { macros, cleaned }
}

function parseFoodItems(text: string): string[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter((l) => l.length > 0 && !/^(note|timing|time)\s*:/i.test(l))

  if (lines.length > 1) return lines
  if (lines.length === 1 && lines[0]!.includes(',')) {
    return lines[0]!.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return lines
}

function parseMealTime(text: string): { mealTime?: string; mealTimer?: string; notes?: string; body: string } {
  let body = text
  let mealTime: string | undefined
  let mealTimer: string | undefined
  let notes: string | undefined

  const timeMatch = text.match(/(?:^|\n)\s*(?:time|timing)\s*:\s*(.+)/i)
  if (timeMatch) {
    mealTime = timeMatch[1]!.trim()
    body = body.replace(timeMatch[0], '')
  }

  const timerMatch = text.match(/(\d+)\s*min(?:ute)?s?\s*(?:before|after|pre|post)/i)
  if (timerMatch) mealTimer = timerMatch[0]

  const noteMatch = text.match(/(?:^|\n)\s*note\s*:\s*(.+)/i)
  if (noteMatch) {
    notes = noteMatch[1]!.trim()
    body = body.replace(noteMatch[0], '')
  }

  return { mealTime, mealTimer, notes, body: body.trim() }
}

function enrichMeal(meal: TrackerMealItem, foods: string): TrackerMealItem {
  const { mealTime, mealTimer, notes, body } = parseMealTime(foods)
  const { macros, cleaned } = parseMealMacros(body)
  const foodItems = parseFoodItems(cleaned)
  const hasMacros = Object.values(macros).some((v) => v != null)

  return {
    ...meal,
    foods: cleaned || foods,
    foodItems: foodItems.length > 0 ? foodItems : undefined,
    macros: hasMacros ? macros : undefined,
    mealTime,
    mealTimer,
    notes,
  }
}

function stripMarkdownDecorators(value: string): string {
  return value.replace(/^\*{1,2}|\*{1,2}$/g, '').replace(/^#{1,3}\s*/, '').trim()
}

const MEAL_NAME_PATTERN =
  'breakfast|lunch|dinner|snack|late snack|evening snack|mid[- ]?morning|morning meal|evening meal|pre[- ]?workout|post[- ]?workout'

function capitalizeLabel(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseDietDayBlocks(diet: string): { key: string; label: string; body: string }[] {
  const normalized = diet.replace(/\r\n/g, '\n')
  const blocks = normalized.split(
    /\n(?=(?:\*{0,2}|#{1,3}\s*)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day\s*\d+)\b)/i
  )

  const days: { key: string; label: string; body: string }[] = []

  for (const block of blocks) {
    const lines = block.split('\n')
    const first = stripMarkdownDecorators(lines[0]?.trim() ?? '')
    const dayMatch = first.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day\s*\d+)\b/i)
    if (!dayMatch) continue
    const raw = dayMatch[1]!.toLowerCase().replace(/\s+/g, ' ')
    const key = slug(raw)
    const label = capitalizeLabel(raw)
    const body = lines.slice(1).join('\n').trim()
    if (!body) continue
    days.push({ key, label, body })
  }

  if (days.length > 0) return days
  return [{ key: 'default', label: 'Today', body: diet.trim() }]
}

function parseMealsInDay(
  dietBody: string,
  dayKey: string,
  dayLabel: string
): TrackerMealItem[] {
  if (!dietBody.trim()) return []
  const lines = dietBody.replace(/\r\n/g, '\n').split('\n')
  const meals: TrackerMealItem[] = []
  const headers = new RegExp(
    `^(?:\\*{0,2}|#{1,3}\\s*)?(${MEAL_NAME_PATTERN})(?:\\s*\\(([^)]*)\\))?\\s*:?\\s*\\*{0,2}\\s*$`,
    'i'
  )
  const periodMap: Record<string, TrackerPeriod> = {
    breakfast: 'morning',
    'morning meal': 'morning',
    'mid-morning': 'morning',
    'mid morning': 'morning',
    'pre-workout': 'morning',
    'pre workout': 'morning',
    lunch: 'lunch',
    snack: 'afternoon',
    'evening snack': 'evening',
    'late snack': 'night',
    dinner: 'evening',
    'evening meal': 'evening',
    'post-workout': 'evening',
    'post workout': 'evening',
  }

  let current: { name: string; mealTime?: string; lines: string[] } | null = null
  const flush = () => {
    if (!current) return
    const foods = current.lines.join('\n').trim()
    if (!foods) return
    const key = current.name.toLowerCase()
    meals.push({
      id: `meal-${dayKey}-${slug(current.name)}`,
      type: 'meal',
      period: periodMap[key] ?? 'lunch',
      icon: '🥗',
      title: capitalizeLabel(current.name),
      foods,
      mealTime: current.mealTime,
      dietDay: dayKey === 'default' ? undefined : dayKey,
      dietDayLabel: dayKey === 'default' ? undefined : dayLabel,
      sortOrder: meals.length,
    })
    current = null
  }

  for (const line of lines) {
    const trimmed = stripMarkdownDecorators(line.trim())
    const match = trimmed.match(headers) ?? line.trim().match(headers)
    if (match) {
      flush()
      current = {
        name: match[1]!,
        mealTime: match[2]?.trim(),
        lines: [],
      }
      continue
    }
    const inline = trimmed.match(
      new RegExp(
        `^(?:\\*{0,2}|#{1,3}\\s*)?(${MEAL_NAME_PATTERN})(?:\\s*\\(([^)]*)\\))?\\s*:\\s*(.+)`,
        'i'
      )
    )
    if (inline) {
      flush()
      const mealKey = inline[1]!.toLowerCase()
      const foods = inline[3]!.trim()
      meals.push(
        enrichMeal(
          {
            id: `meal-${dayKey}-${slug(inline[1]!)}`,
            type: 'meal',
            period: periodMap[mealKey] ?? 'lunch',
            icon: '🥗',
            title: capitalizeLabel(inline[1]!),
            foods,
            mealTime: inline[2]?.trim(),
            dietDay: dayKey === 'default' ? undefined : dayKey,
            dietDayLabel: dayKey === 'default' ? undefined : dayLabel,
            sortOrder: meals.length,
          },
          foods
        )
      )
      current = null
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()

  return meals.map((m) => enrichMeal(m, m.foods))
}

function parseMeals(diet: string): {
  meals: TrackerMealItem[]
  dietDays: { key: string; label: string }[]
} {
  if (!diet.trim()) return { meals: [], dietDays: [] }

  const dayBlocks = parseDietDayBlocks(diet)
  const meals: TrackerMealItem[] = []
  const dietDays: { key: string; label: string }[] = []

  for (const day of dayBlocks) {
    const dayMeals = parseMealsInDay(day.body, day.key, day.label)
    if (dayMeals.length === 0) continue
    meals.push(...dayMeals)
    if (day.key !== 'default') {
      dietDays.push({ key: day.key, label: day.label })
    }
  }

  // Fallback: whole diet has meal headers but no day headers matched usefully
  if (meals.length === 0) {
    const fallback = parseMealsInDay(diet, 'default', 'Today')
    return { meals: fallback, dietDays: [] }
  }

  return { meals, dietDays }
}

const PHASE_HEADERS =
  /^(?:#{1,3}\s*)?(warm[- ]?up|activation|mobility|prep|main(?:\s+workout)?|working\s+sets?|strength|hypertrophy|accessory|accessories|compound|cool[- ]?down|post[- ]?workout|recovery|stretch(?:ing)?|finisher)\s*:?\s*$/i

const PHASE_MAP: Record<string, WorkoutExercisePhase> = {
  'warm-up': 'warmup',
  warmup: 'warmup',
  activation: 'warmup',
  prep: 'warmup',
  mobility: 'mobility',
  main: 'main',
  'main workout': 'main',
  'working sets': 'main',
  'working set': 'main',
  strength: 'main',
  hypertrophy: 'main',
  accessory: 'main',
  accessories: 'main',
  compound: 'main',
  cooldown: 'cooldown',
  'cool-down': 'cooldown',
  'post-workout': 'cooldown',
  recovery: 'cooldown',
  stretching: 'cooldown',
  stretch: 'cooldown',
  finisher: 'finisher',
}

const PHASE_LABELS: Record<WorkoutExercisePhase, string> = {
  warmup: 'Warm-up',
  mobility: 'Mobility',
  main: 'Main Workout',
  finisher: 'Finisher',
  cooldown: 'Post-Workout',
}

function capitalizeDay(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseExerciseLine(line: string, phase: WorkoutExercisePhase, index: number): TrackerExerciseItem | null {
  const trimmed = stripMarkdownDecorators(line.replace(/^[-*•]\s*/, '').trim())
  if (!trimmed || trimmed.startsWith('#')) return null
  // Skip day / phase headers — they are handled separately
  if (/^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(trimmed)) {
    return null
  }
  if (PHASE_HEADERS.test(trimmed)) return null
  // Skip multi-exercise core dump lines; handled by splitCoreExercises
  if (/^core\s*:/i.test(trimmed) && /,/.test(trimmed)) return null

  // AI coach format: "Barbell Bench Press: 5 sets x 5 reps (...)"
  const setsReps =
    /^(.+?)\s*:?\s*(\d+)\s*sets?\s*[x×]\s*(\d+(?:\s*-\s*\d+)?|AMRAP|\d+\s*s)(?:\s*reps?)?(?:\s*(?:each(?:\s+side)?|\/side))?(?:\s*(?:@|at)\s*([\d.]+)\s*(?:kg|lbs?))?(?:\s*[\-(].*)?$/i
  // Compact format: "Bench Press 4x8 @ 60 kg"
  const compact =
    /^(.+?)\s+(\d+)\s*[x×]\s*(\d+(?:-\d+)?|AMRAP|\d+s)(?:\s*(?:@|at)\s*([\d.]+)\s*(?:kg|lbs?))?(?:\s*[-–—]\s*(.+))?/i

  const match = trimmed.match(setsReps) ?? trimmed.match(compact)
  if (!match) return null

  let name = match[1]!.trim().replace(/:$/, '').trim()
  // Drop leading labels like "Core: "
  name = name.replace(/^(?:core|finisher|accessory)\s*:\s*/i, '').trim()
  if (!name || name.length < 2) return null

  const restMatch = trimmed.match(
    /(?:rest|recover(?:y)?)\s*(?:for\s*)?(\d+)\s*(?:[-–]\s*\d+)?\s*(s|sec|secs|seconds|m|min|mins|minutes)?/i
  )
  const parenNotes = name.match(/^(.+?)\s*\((.+)\)$/)
  const cleanName = parenNotes?.[1]?.trim() ?? name
  const inlineNotes = parenNotes?.[2]?.trim() ?? match[5]?.trim()
  const reps = match[3]!.replace(/\s+/g, '')
  let restSeconds: number | undefined
  if (restMatch) {
    const amount = Number(restMatch[1])
    const unit = (restMatch[2] ?? 's').toLowerCase()
    restSeconds = /m/.test(unit) ? amount * 60 : amount
  }

  return withTrackingMeta({
    id: `ex-${phase}-${slug(cleanName)}-${index}`,
    name: cleanName,
    targetSets: Number(match[2]),
    targetReps: reps,
    targetWeight: match[4] ? `${match[4]} kg` : undefined,
    phase,
    restSeconds,
    notes: inlineNotes,
  })
}

/** Split "Core: Move A 3 sets x 12, Move B 2 sets x 10" into separate exercise lines. */
function expandCompositeExerciseLines(line: string): string[] {
  const trimmed = stripMarkdownDecorators(line.replace(/^[-*•]\s*/, '').trim())
  const coreMatch = trimmed.match(/^core\s*:\s*(.+)$/i)
  if (!coreMatch || !coreMatch[1]!.includes(',')) return [line]
  return coreMatch[1]!
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseWorkoutPhases(section: string): {
  dayLabel?: string
  focus?: string
  workoutNotes?: string
  phases: WorkoutPhaseBlock[]
  exercises: TrackerExerciseItem[]
} {
  const lines = section.replace(/\r\n/g, '\n').split('\n')
  const phaseBuckets = new Map<WorkoutExercisePhase, TrackerExerciseItem[]>()
  const noteLines: string[] = []
  let currentPhase: WorkoutExercisePhase = 'main'
  let dayLabel: string | undefined
  let focus: string | undefined
  let headerConsumed = false
  let exerciseIndex = 0

  const addExercise = (ex: TrackerExerciseItem) => {
    const list = phaseBuckets.get(ex.phase) ?? []
    list.push(ex)
    phaseBuckets.set(ex.phase, list)
    exerciseIndex++
  }

  for (const rawLine of lines) {
    const trimmed = stripMarkdownDecorators(rawLine.trim())
    if (!trimmed) continue

    if (!headerConsumed) {
      const dayFocusMatch = trimmed.match(
        /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day\s*\d+)\s*[-–—:]\s*(.+)/i
      )
      if (dayFocusMatch) {
        dayLabel = capitalizeDay(dayFocusMatch[1]!)
        focus = dayFocusMatch[2]!.trim().replace(/\*+$/, '').trim()
        headerConsumed = true
        continue
      }
      const dayOnly = trimmed.match(
        /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day\s*\d+)\s*$/i
      )
      if (dayOnly) {
        dayLabel = capitalizeDay(dayOnly[1]!)
        headerConsumed = true
        continue
      }
      const focusOnly = parseWorkoutFocus(section)
      if (focusOnly && stripMarkdownDecorators(trimmed.replace(/^#{1,3}\s*/, '')) === focusOnly) {
        focus = focusOnly
        headerConsumed = true
        continue
      }
      headerConsumed = true
    }

    const phaseMatch = trimmed.match(PHASE_HEADERS)
    if (phaseMatch) {
      const key = phaseMatch[1]!.toLowerCase().replace(/\s+/g, ' ')
      currentPhase = PHASE_MAP[key] ?? 'main'
      continue
    }

    let matchedExercise = false
    for (const candidate of expandCompositeExerciseLines(trimmed)) {
      const exercise = parseExerciseLine(candidate, currentPhase, exerciseIndex)
      if (exercise) {
        addExercise(exercise)
        matchedExercise = true
      }
    }
    if (matchedExercise) continue

    if (!trimmed.startsWith('-') && !trimmed.startsWith('•') && trimmed.length > 10) {
      noteLines.push(stripMarkdownDecorators(trimmed.replace(/^#{1,3}\s*/, '')))
    }
  }

  const phaseOrder: WorkoutExercisePhase[] = ['warmup', 'mobility', 'main', 'finisher', 'cooldown']
  const phases: WorkoutPhaseBlock[] = phaseOrder
    .filter((p) => (phaseBuckets.get(p)?.length ?? 0) > 0)
    .map((p) => ({
      id: `phase-${p}`,
      phase: p,
      label: PHASE_LABELS[p],
      exercises: phaseBuckets.get(p)!,
    }))

  const exercises = phases.flatMap((p) => p.exercises)

  return {
    dayLabel,
    focus,
    workoutNotes: noteLines.length > 0 ? noteLines.join('\n') : undefined,
    phases,
    exercises,
  }
}

function parseExercises(text: string): TrackerExerciseItem[] {
  return parseWorkoutPhases(text).exercises
}

function splitWorkoutDayBlocks(workoutText: string): { key: string; label: string; body: string }[] {
  if (!workoutText.trim()) return []

  const blocks = workoutText.split(
    /\n(?=(?:\*{0,2}|#{1,3}\s*)?(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i
  )

  const days: { key: string; label: string; body: string }[] = []
  for (const block of blocks) {
    const first = stripMarkdownDecorators(block.split('\n')[0] ?? '').trim()
    const dayMatch = first.match(
      /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day\s*\d+)\b/i
    )
    if (!dayMatch) continue
    const raw = dayMatch[1]!.toLowerCase().replace(/\s+/g, ' ')
    days.push({ key: slug(raw), label: capitalizeLabel(raw), body: block.trim() })
  }

  if (days.length > 0) return days
  return [{ key: 'default', label: 'Today', body: workoutText.trim() }]
}

/** Suggest which plan day matches the calendar weekday / Day N convention. */
export function suggestedWorkoutDayKey(
  days: { key: string; label: string }[],
  referenceDate = new Date()
): string | null {
  if (days.length === 0) return null
  const dayName = DAY_NAMES[referenceDate.getDay()]!
  const programDay = referenceDate.getDay() || 7
  return (
    days.find((d) => d.key === dayName)?.key ??
    days.find((d) => d.key === `day-${programDay}` || d.key === slug(`day ${programDay}`))?.key ??
    days[0]!.key
  )
}

function prefixIdsForWorkoutDay<T extends { id: string }>(items: T[], dayKey: string): T[] {
  if (dayKey === 'default') return items
  return items.map((item) => ({
    ...item,
    id: item.id.startsWith(`${dayKey}-`) ? item.id : `${dayKey}-${item.id}`,
  }))
}

function parseWorkouts(workoutText: string): {
  workouts: TrackerWorkoutItem[]
  workoutDays: { key: string; label: string }[]
} {
  if (!workoutText.trim()) return { workouts: [], workoutDays: [] }

  const sharedWarmup = extractSharedPhaseExercises(workoutText, 'warmup')
  const sharedCooldown = extractSharedPhaseExercises(workoutText, 'cooldown')
  const blocks = splitWorkoutDayBlocks(workoutText)
  const workouts: TrackerWorkoutItem[] = []
  const workoutDays: { key: string; label: string }[] = []

  for (const day of blocks) {
    const parsed = parseWorkoutPhases(day.body)
    const merged = mergePhaseExercises(
      parsed.phases,
      parsed.exercises,
      sharedWarmup,
      sharedCooldown
    )
    if (merged.exercises.length === 0) continue

    const phases = merged.phases.map((phase) => ({
      ...phase,
      id: day.key === 'default' ? phase.id : `${day.key}-${phase.id}`,
      exercises: prefixIdsForWorkoutDay(phase.exercises, day.key),
    }))
    const exercises = prefixIdsForWorkoutDay(merged.exercises, day.key)
    const dayLabel = parsed.dayLabel ?? day.label
    const focus = parsed.focus ?? parseWorkoutFocus(day.body)

    workouts.push({
      id: day.key === 'default' ? 'workout-today' : `workout-${day.key}`,
      type: 'workout',
      period: 'workout',
      icon: '🏋',
      title: day.key === 'default' ? "Today's Workout" : `${dayLabel} Workout`,
      dayLabel,
      focus,
      workoutNotes: parsed.workoutNotes,
      workoutDay: day.key === 'default' ? undefined : day.key,
      workoutDayLabel: day.key === 'default' ? undefined : day.label,
      phases,
      exercises,
      sortOrder: 50,
    })

    if (day.key !== 'default') {
      workoutDays.push({ key: day.key, label: day.label })
    }
  }

  return { workouts, workoutDays }
}

function parseWorkoutFocus(section: string): string | undefined {
  const firstLine = section.split('\n').find((l) => l.trim())?.trim() ?? ''
  if (!firstLine) return undefined
  const withoutDay = firstLine
    .replace(/^#{1,3}\s*/, '')
    .replace(
      /^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[-–—:]\s*/i,
      ''
    )
    .trim()
  if (!withoutDay || /^[-*•]/.test(withoutDay)) return undefined
  if (/^\d+\s*[x×]/.test(withoutDay)) return undefined
  return withoutDay
}

function parseNarrativeMovementList(
  blob: string,
  phase: WorkoutExercisePhase,
  idPrefix: string
): TrackerExerciseItem[] {
  const cleaned = blob
    .replace(/\s+/g, ' ')
    .replace(/^(?:before every session[^:]*:\s*|spend about[^:]*:\s*)/i, '')
    .split(
      /\b(?:Keep it flowing|Then before you hit|Here's how|Here is how|Target:)\b/i
    )[0]!
    .trim()
  if (!cleaned) return []

  const parts = cleaned
    .split(/,\s*(?:and\s+)?|(?:\s+and\s+)|;\s+|(?:\bthen\b\s+(?:move through\s+)?)/i)
    .map((p) => p.replace(/\.$/, '').trim())
    .filter((p) => p.length > 3 && p.length < 80)

  const exercises: TrackerExerciseItem[] = []
  let index = 0

  for (const part of parts) {
    const duration = part.match(
      /^(\d+)\s*(?:[-–]\s*(\d+))?\s*(?:minutes?|mins?|min)\s+(?:of\s+)?(.+)$/i
    )
    if (duration) {
      const low = duration[1]!
      const high = duration[2]
      const name = duration[3]!
        .replace(/\bon the treadmill\b/i, '')
        .replace(/\bor\b.+$/i, (m) => m) // keep "walking or jogging"
        .trim()
      if (name.length < 3) continue
      exercises.push(
        withTrackingMeta({
          id: `ex-${idPrefix}-${slug(name)}-${index}`,
          name: capitalizeLabel(name),
          targetSets: 1,
          targetReps: high ? `${low}-${high} min` : `${low} min`,
          phase,
          restSeconds: 30,
        })
      )
      index++
      continue
    }

    const count = part.match(
      /^(?:move through\s+)?(\d+)\s*(?:[-–]\s*(\d+))?\s+([A-Za-z][A-Za-z0-9 \-/]{1,40})$/i
    )
    if (count) {
      const low = count[1]!
      const high = count[2]
      let name = count[3]!.trim()
      name = name.replace(/^(?:of\s+)/i, '').replace(/\s+each(?:\s+\w+)?$/i, '').trim()
      if (/^(easy|light|about|this|the|your)\b/i.test(name) && name.length < 12) continue
      exercises.push(
        withTrackingMeta({
          id: `ex-${idPrefix}-${slug(name)}-${index}`,
          name: capitalizeLabel(name),
          targetSets: 1,
          targetReps: high ? `${low}-${high}` : low,
          phase,
          restSeconds: phase === 'warmup' ? 20 : 30,
        })
      )
      index++
    }
  }

  return exercises
}

/** Pull shared warm-up / post-workout blocks from the overall plan (outside day lists). */
function extractSharedPhaseExercises(
  fullWorkout: string,
  phase: 'warmup' | 'cooldown'
): TrackerExerciseItem[] {
  const text = fullWorkout.replace(/\r\n/g, '\n')
  const patterns =
    phase === 'warmup'
      ? [
          /(?:before every session[^\n]*warmup|warmup routine|warm[- ]?up(?:\s+routine)?)[:\s]+([\s\S]+?)(?=\n\s*\n(?:here's how|here is how|\*\*day|day\s*\d+|monday|tuesday)|$)/i,
          /(?:##\s*)?warmup[^\n]*\n([\s\S]+?)(?=\n\s*##|\n\s*\*\*day|\n\s*day\s*\d+|$)/i,
        ]
      : [
          /(?:^|\n)(?:#{1,3}\s*|\*{0,2})?(?:post[- ]?workout|cool[- ]?down|cooldown)(?:\s+routine)?\*{0,2}\s*[:\-–—]\s*([\s\S]+?)(?=\n\s*(?:#{1,3}|\*{0,2})?(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|breakfast)|\n\s*\n\s*\n|$)/im,
          /(?:##\s*)?(?:post[- ]?workout|cool[- ]?down|cooldown)[^\n]*\n([\s\S]+?)(?=\n\s*##|\n\s*\*\*day|\n\s*day\s*\d+|$)/i,
        ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue

    const block = match[1].trim()
    // Prefer structured exercise lines inside the block
    const structured = parseWorkoutPhases(
      `${phase === 'warmup' ? 'Warm-up' : 'Post-Workout'}\n${block}`
    ).exercises.filter((ex) => ex.phase === phase || ex.phase === 'main')

    if (structured.length > 0) {
      return structured
        .filter((ex) => !/steps|intensity|rep ranges/i.test(ex.name))
        .map((ex, idx) => ({
          ...ex,
          phase,
          id: `ex-${phase}-shared-${slug(ex.name)}-${idx}`,
          restSeconds: ex.restSeconds ?? (phase === 'warmup' ? 30 : 45),
        }))
    }

    const narrative = parseNarrativeMovementList(block, phase, `${phase}-shared`)
    if (narrative.length > 0) return narrative
  }

  return []
}

function mergePhaseExercises(
  dayPhases: WorkoutPhaseBlock[],
  dayExercises: TrackerExerciseItem[],
  sharedWarmup: TrackerExerciseItem[],
  sharedCooldown: TrackerExerciseItem[]
): { phases: WorkoutPhaseBlock[]; exercises: TrackerExerciseItem[] } {
  const byPhase = new Map<WorkoutExercisePhase, TrackerExerciseItem[]>()

  const add = (ex: TrackerExerciseItem) => {
    const list = byPhase.get(ex.phase) ?? []
    list.push(ex)
    byPhase.set(ex.phase, list)
  }

  for (const ex of sharedWarmup) add(ex)
  for (const block of dayPhases) {
    for (const ex of block.exercises) add(ex)
  }
  // Day exercises not already in blocks (shouldn't happen) + shared cooldown last
  for (const ex of dayExercises) {
    const exists = (byPhase.get(ex.phase) ?? []).some((e) => e.id === ex.id)
    if (!exists) add(ex)
  }
  for (const ex of sharedCooldown) add(ex)

  // Always include a warm-up block — use plan warmup when present, otherwise defaults
  if ((byPhase.get('warmup')?.length ?? 0) === 0) {
    for (const ex of DEFAULT_WARMUP_EXERCISES) add(ex)
  }

  const phaseOrder: WorkoutExercisePhase[] = ['warmup', 'mobility', 'main', 'finisher', 'cooldown']
  const phases: WorkoutPhaseBlock[] = phaseOrder
    .filter((p) => (byPhase.get(p)?.length ?? 0) > 0)
    .map((p) => ({
      id: `phase-${p}`,
      phase: p,
      label: PHASE_LABELS[p],
      exercises: byPhase.get(p)!,
    }))

  return { phases, exercises: phases.flatMap((p) => p.exercises) }
}

function parseCardio(cardio: string): TrackerCardioItem[] {
  if (!cardio.trim()) return []
  const items: TrackerCardioItem[] = []
  const lines = cardio.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
    const stepsMatch = line.match(/(\d[\d,]*)\s*steps/i)
    if (stepsMatch) {
      items.push({
        id: 'cardio-steps',
        type: 'cardio',
        period: 'afternoon',
        icon: '🚶',
        title: 'Daily Steps',
        activity: 'Walking',
        target: stepsMatch[1]!.replace(/,/g, ''),
        unit: 'steps',
        sortOrder: 40,
      })
      continue
    }

    const durationMatch = line.match(/(\d+)\s*min/i)
    const activity = line.split(/[-:]/)[0]?.trim() || 'Cardio'
    items.push({
      id: `cardio-${slug(activity)}`,
      type: 'cardio',
      period: 'afternoon',
      icon: '🚶',
      title: activity,
      activity,
      target: durationMatch?.[1] ?? '30',
      unit: durationMatch ? 'min' : 'session',
      sortOrder: 40 + items.length,
    })
  }

  return items
}

function parseSupplements(supplements: string): TrackerSupplementItem[] {
  if (!supplements.trim()) return []
  const lines = supplements.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
  const periodHeaders = /^(?:#{1,3}\s*)?(morning|afternoon|evening|night|midday|am|pm)\s*:?\s*$/i
  const periodFromHeader: Record<string, TrackerPeriod> = {
    morning: 'morning',
    am: 'morning',
    midday: 'lunch',
    afternoon: 'afternoon',
    evening: 'evening',
    pm: 'evening',
    night: 'night',
  }

  let currentPeriod: TrackerPeriod = 'morning'
  const items: TrackerSupplementItem[] = []

  for (const line of lines) {
    const periodMatch = line.match(periodHeaders)
    if (periodMatch) {
      const key = periodMatch[1]!.toLowerCase()
      currentPeriod = periodFromHeader[key] ?? 'morning'
      continue
    }

    const lower = line.toLowerCase()
    let period = currentPeriod
    if (lower.includes('evening') || /\bpm\b/.test(lower)) period = 'evening'
    if (lower.includes('night') || lower.includes('bed')) period = 'night'
    if (lower.includes('morning') || /\bam\b/.test(lower)) period = 'morning'

    const cleaned = line.replace(/^[-*•]\s*/, '').trim()
    if (!cleaned || periodHeaders.test(cleaned)) continue

    const doseMatch = cleaned.match(/(\d+\s*(?:mg|g|iu|ml|scoop[s]?)[^.]*)/i)
    const title = cleaned.split(/[-–—:]/)[0]?.trim() || cleaned
    items.push({
      id: `supp-${slug(title)}-${items.length}`,
      type: 'supplement',
      period,
      icon: '💊',
      title,
      dose: doseMatch?.[1],
      sortOrder: period === 'morning' ? 5 + items.length : period === 'evening' ? 70 + items.length : 90 + items.length,
    })
  }

  return items
}

function parseWaterTarget(
  sections: { cardio: string; coachNotes: string },
  profile?: OnboardingProfile | null
): number {
  const combined = `${sections.cardio}\n${sections.coachNotes}`
  const literMatch = combined.match(/(\d+(?:\.\d+)?)\s*l(?:iters?)?/i)
  if (literMatch) return Math.round(Number(literMatch[1]) * 1000)

  const mlMatch = combined.match(/(\d{3,5})\s*ml/i)
  if (mlMatch) return Number(mlMatch[1])

  const waterLabel = profile?.onboarding_data?.lifestyle?.waterIntake ?? ''
  if (waterLabel.includes('4')) return 4000
  if (waterLabel.includes('3')) return 3000
  if (waterLabel.includes('2')) return 2000
  return 3000
}

function parseSleep(profile?: OnboardingProfile | null, coachNotes?: string): TrackerSleepItem {
  const bedtimeMatch = coachNotes?.match(/bed(?:time)?\s*(?:by|at)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)
  const hoursMatch = (profile?.sleep_duration ?? coachNotes ?? '').match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i)
  return {
    id: 'sleep-daily',
    type: 'sleep',
    period: 'night',
    icon: '🌙',
    title: 'Sleep',
    targetBedtime: bedtimeMatch?.[1] ?? '10:30 PM',
    targetHours: hoursMatch ? Number(hoursMatch[1]) : 8,
    sortOrder: 100,
  }
}

/** Build today's tracker template from the active plan — no manual setup. */
export function buildTrackerSnapshot(
  plan: Plan,
  profile?: OnboardingProfile | null,
  referenceDate = new Date()
): TrackerSnapshot {
  const sections = resolvePlanSectionsFromPlan(plan)
  const items: TrackerSnapshotItem[] = []

  const { meals, dietDays } = parseMeals(sections.diet)
  for (const meal of meals) items.push(meal)
  const { workouts, workoutDays } = parseWorkouts(sections.workout)
  for (const workout of workouts) items.push(workout)
  for (const cardio of parseCardio(sections.cardio)) items.push(cardio)
  for (const supp of parseSupplements(sections.supplements)) items.push(supp)

  items.push({
    id: 'water-daily',
    type: 'water',
    period: 'morning',
    icon: '💧',
    title: 'Water Intake',
    targetMl: parseWaterTarget({ cardio: sections.cardio, coachNotes: sections.coachNotes }, profile),
    sortOrder: 10,
  })

  items.push(parseSleep(profile, sections.coachNotes))

  if (sections.coachNotes.trim()) {
    const note: TrackerNoteItem = {
      id: 'coach-note',
      type: 'note',
      period: 'morning',
      icon: '☀️',
      title: 'Coach Notes',
      body: sections.coachNotes.trim(),
      sortOrder: 1,
    }
    items.push(note)
  }

  items.sort((a, b) => a.sortOrder - b.sortOrder)

  return {
    generatedAt: new Date().toISOString(),
    planId: plan.id,
    planVersion: plan.version,
    planTitle: plan.title,
    planUpdatedAt: plan.updated_at,
    items,
    dietDays: dietDays.length > 0 ? dietDays : undefined,
    workoutDays: workoutDays.length > 0 ? workoutDays : undefined,
  }
}

export function mergeCompletion(previous: TrackerCompletion, next: TrackerCompletion): TrackerCompletion {
  return {
    meals: { ...previous.meals, ...next.meals },
    exercises: { ...previous.exercises, ...next.exercises },
    cardio: { ...previous.cardio, ...next.cardio },
    supplements: { ...previous.supplements, ...next.supplements },
    water: next.water ?? previous.water,
    sleep: { ...previous.sleep, ...next.sleep },
    selectedDietDay:
      next.selectedDietDay === null
        ? undefined
        : next.selectedDietDay !== undefined
          ? next.selectedDietDay
          : previous.selectedDietDay,
    selectedWorkoutDay:
      next.selectedWorkoutDay === null
        ? undefined
        : next.selectedWorkoutDay !== undefined
          ? next.selectedWorkoutDay
          : previous.selectedWorkoutDay,
    workoutSession:
      next.workoutSession === null
        ? undefined
        : next.workoutSession !== undefined
          ? { ...previous.workoutSession, ...next.workoutSession }
          : previous.workoutSession,
  }
}
