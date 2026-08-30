import { resolvePlanDayMeta, toProgramDayLabel, WEEKDAY_PROGRAM_DAY } from '@/lib/plan-day-labels'
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
  TrackerPlanDayOption,
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
import { withDerivedSleepHours } from './sleep-duration'

/** Bump when parser output shape/names change so today's tracker rebuilds without a manual tap. */
export const TRACKER_PARSER_VERSION = 7

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

/** Calendar weekday name in Asia/Kolkata (matches tracker log_date). */
export function getIstWeekdayName(referenceDate: Date = new Date()): (typeof DAY_NAMES)[number] {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
  })
    .format(referenceDate)
    .toLowerCase()
  if ((DAY_NAMES as readonly string[]).includes(weekday)) {
    return weekday as (typeof DAY_NAMES)[number]
  }
  return DAY_NAMES[referenceDate.getDay()]!
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

function parseDietDayBlocks(diet: string): (TrackerPlanDayOption & { body: string })[] {
  const normalized = diet.replace(/\r\n/g, '\n')
  const blocks = normalized.split(
    /\n(?=(?:\*{0,2}|#{1,3}\s*)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day\s*\d+)\b)/i
  )

  const days: (TrackerPlanDayOption & { body: string })[] = []

  for (const block of blocks) {
    const lines = block.split('\n')
    const first = stripMarkdownDecorators(lines[0]?.trim() ?? '')
    const dayMatch = first.match(
      /^(?:(day\s*\d+)|(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b(?:\s*[(\[–—:-]+\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday))?/i
    )
    if (!dayMatch) continue
    const dayToken = (dayMatch[1] || dayMatch[2] || '').toLowerCase().replace(/\s+/g, ' ')
    const weekdayHint = dayMatch[3]?.toLowerCase()
    const { key, label, calendarAligned } = resolvePlanDayMeta(dayToken, weekdayHint)
    const body = lines.slice(1).join('\n').trim()
    if (!body) continue
    days.push({ key, label, calendarAligned, body })
  }

  if (days.length > 0) return days
  return [{ key: 'default', label: 'Today', calendarAligned: false, body: diet.trim() }]
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
  const dietDays: TrackerPlanDayOption[] = []

  for (const day of dayBlocks) {
    const dayMeals = parseMealsInDay(day.body, day.key, day.label)
    if (dayMeals.length === 0) continue
    meals.push(...dayMeals)
    if (day.key !== 'default') {
      dietDays.push({ key: day.key, label: day.label, calendarAligned: day.calendarAligned })
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
  /^(?:#{1,3}\s*)?(warm[- ]?up|pre[- ]?workout|activation|mobility|prep|main(?:\s+workout)?|working\s+sets?|strength|hypertrophy|accessory|accessories|compound|cool[- ]?down|post[- ]?workout(?:\s+stretching)?|stretching|recovery|finisher)\s*:?\s*$/i

/** Muscle-group or session labels with no movement — not tracker exercises. */
const SESSION_LABEL_ONLY =
  /^(?:#{1,3}\s*)?(?:lower|upper|push|pull|legs?|chest|back|shoulders?|arms?|glutes?|core)(?:\s+(?:body|day|session|emphasis|hypertrophy|strength|power|density|push|pull)){0,3}\s*:?\s*$/i

/** Coaching purpose sentences the model sometimes writes instead of a lift name. */
const PURPOSE_AS_NAME =
  /\b(endurance|race effort|for the full|transformation|aesthetic|build the|develop your|improve your)\b/i

/** True when a tracker "exercise name" is actually coach chatter or a tempo cue. */
export function isCoachingExerciseName(text: string): boolean {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return true
  if (PURPOSE_AS_NAME.test(t)) return true
  if (t.length > 64) return true
  const words = t.split(' ').filter(Boolean)
  if (words.length > 10) return true
  if (
    /^(focus on|keep the|remember|make sure|these are|this is|today we|you(?:'ll| will)|i want you|aim to|try to|be sure|let's|lets)\b/i.test(
      t
    )
  ) {
    return true
  }
  if (/[—.!?]/.test(t) && words.length >= 6) return true
  if (/\b(anchors?|tempo|controlled|on the way down|strength anchors)\b/i.test(t)) return true
  return false
}

const DAY_SESSION_HEADER =
  /^(?:(day\s*\d+)|(monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:\s*\((monday|tuesday|wednesday|thursday|friday|saturday|sunday)\))?\s*[-–—:]\s*(.+)/i

const PHASE_MAP: Record<string, WorkoutExercisePhase> = {
  'warm-up': 'warmup',
  warmup: 'warmup',
  'pre-workout': 'warmup',
  'pre workout': 'warmup',
  preworkout: 'warmup',
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
  'post-workout stretching': 'cooldown',
  stretching: 'cooldown',
  recovery: 'cooldown',
  finisher: 'finisher',
}

/** Day-header boundary used when slicing shared warm-up / post-workout blocks. */
const DAY_HEADER_BOUNDARY =
  '(?:#{1,3}\\s*|\\*{0,2})?(?:day\\s*\\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b'

const PHASE_LABELS: Record<WorkoutExercisePhase, string> = {
  warmup: 'Pre-Workout',
  mobility: 'Mobility',
  main: 'Main Workout',
  finisher: 'Finisher',
  cooldown: 'Post-Workout',
}

/** True when the day block is clearly a rest / off day (not a failed exercise parse). */
function isExplicitRestDayText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalized) return true
  if (/\b(rest\s*day|full\s*rest|active\s*recovery|off\s*day|recovery\s*day)\b/i.test(normalized)) {
    return true
  }
  // Short day headers like "Day 3 — Rest" / "Wednesday: Rest"
  if (/^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.{0,40}\brest\b/i.test(normalized)) {
    return true
  }
  // Training-like titles should never be auto-classified as rest when empty.
  if (
    /\b(lower|upper|push|pull|legs?|chest|back|shoulders?|arms?|full\s*body|power|strength|hypertrophy|glute|hinge|squat|conditioning|metcon)\b/i.test(
      normalized
    )
  ) {
    return false
  }
  // Empty-ish body after stripping the day header → treat as rest.
  const withoutHeader = normalized
    .replace(/^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^\n]*/i, '')
    .trim()
  return withoutHeader.length < 8
}

function stripExerciseListPrefix(value: string): string {
  return value
    .replace(/^(?:[A-Za-z]\d+[.)]\s*|\d+[.)]\s*)/, '')
    .replace(/^(?:core|finisher|accessories?|abs?)\s*:\s*/i, '')
    .trim()
}

function parseExerciseLine(line: string, phase: WorkoutExercisePhase, index: number): TrackerExerciseItem | null {
  const trimmed = stripExerciseListPrefix(
    stripMarkdownDecorators(line.replace(/^[-*•]\s*/, '').trim())
  )
  if (!trimmed || trimmed.startsWith('#')) return null
  // Skip day / phase headers — they are handled separately
  if (/^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(trimmed)) {
    return null
  }
  if (PHASE_HEADERS.test(trimmed) || SESSION_LABEL_ONLY.test(trimmed)) return null
  if (isCoachingExerciseName(trimmed)) return null
  // Skip multi-exercise core dump lines; handled by expandCompositeExerciseLines
  if (/^core\s*:/i.test(trimmed) && /,/.test(trimmed)) return null

  // Rep token: fixed, hyphen range, or AI "N to M" prose range (plan style forbids hyphens).
  const repsToken = String.raw`(\d+(?:\s*(?:-|–|to)\s*\d+)?|AMRAP|\d+\s*s)`
  // AI coach format: "Barbell Bench Press: 5 sets x 6 to 8 reps (...)"
  const setsReps = new RegExp(
    String.raw`^(.+?)\s*[:–—]?\s*(\d+)\s*sets?\s*[x×]\s*${repsToken}(?:\s*reps?)?(?:\s*(?:each(?:\s+side)?|\/side))?(?:\s*(?:@|at)\s*([\d.]+)\s*(?:kg|lbs?))?(?:\s*[\-(].*)?$`,
    'i'
  )
  // Alternate AI phrasing: "Bench Press: 4 sets of 8 to 10 reps"
  const setsOf = new RegExp(
    String.raw`^(.+?)\s*[:–—]?\s*(\d+)\s*sets?\s+of\s+${repsToken}(?:\s*reps?)?(?:\s*(?:each(?:\s+side)?|\/side))?(?:\s*(?:@|at)\s*([\d.]+)\s*(?:kg|lbs?))?(?:\s*[\-(].*)?$`,
    'i'
  )
  // Compact format: "Bench Press 4x8 @ 60 kg" / "Squat 4x6-8"
  const compact = new RegExp(
    String.raw`^(.+?)\s+(\d+)\s*[x×]\s*${repsToken}(?:\s*(?:@|at)\s*([\d.]+)\s*(?:kg|lbs?))?(?:\s*[-–—]\s*(.+))?`,
    'i'
  )

  // "Bench Press: 4 sets, 8 to 10 reps" (comma instead of x/of)
  const setsComma = new RegExp(
    String.raw`^(.+?)\s*:?\s*(\d+)\s*sets?\s*,\s*${repsToken}(?:\s*reps?)?(?:\s*(?:each(?:\s+side)?|\/side))?(?:\s*(?:@|at)\s*([\d.]+)\s*(?:kg|lbs?))?(?:\s*[\-(].*)?$`,
    'i'
  )
  // Timed holds: "Plank 45 seconds" / "Side plank: 30s" — must be the whole line,
  // not a tempo cue buried in coaching prose like "(2-3s)".
  const timedHold = trimmed.match(
    /^(.{2,60}?)\s*:?\s*(\d+)\s*(?:x\s*)?(s|sec|secs|seconds|min|mins|minutes)\b(?:\s*(?:each(?:\s+side)?|hold|\/side)?)?\s*$/i
  )

  const match = trimmed.match(setsReps) ?? trimmed.match(setsOf) ?? trimmed.match(setsComma) ?? trimmed.match(compact)
  if (!match && timedHold && timedHold[1]!.trim().length >= 2) {
    const holdName = timedHold[1]!.trim().replace(/:$/, '')
    if (
      !/[a-z]/i.test(holdName) ||
      SESSION_LABEL_ONLY.test(holdName) ||
      isCoachingExerciseName(holdName)
    ) {
      return null
    }
    const amount = timedHold[2]!
    const unit = timedHold[3]!.toLowerCase()
    const reps = /m/.test(unit) ? `${amount} min` : `${amount}s`
    return withTrackingMeta({
      id: `ex-${phase}-${slug(holdName)}-${index}`,
      name: holdName,
      targetSets: 1,
      targetReps: reps,
      phase,
      restSeconds: 20,
    })
  }
  if (!match) return null

  let name = match[1]!.trim().replace(/:$/, '').trim()
  // Drop leading labels like "Core: "
  name = name.replace(/^(?:core|finisher|accessory)\s*:\s*/i, '').trim()
  if (!name || name.length < 2 || isCoachingExerciseName(name)) return null

  const restMatch = trimmed.match(
    /(?:rest|recover(?:y)?)\s*(?:for\s*)?(\d+)\s*(?:[-–]\s*\d+)?\s*(s|sec|secs|seconds|m|min|mins|minutes)?/i
  )
  const parenNotes = name.match(/^(.+?)\s*\((.+)\)$/)
  const cleanName = parenNotes?.[1]?.trim() ?? name
  const inlineNotes = parenNotes?.[2]?.trim() ?? match[5]?.trim()
  // Normalize "6 to 8" / "6–8" → "6-8" for compact tracker display.
  const reps = match[3]!.replace(/\s*(?:to|–)\s*/gi, '-').replace(/\s+/g, '')
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
  const labeled = trimmed.match(/^(?:core|finisher|accessories?|abs?)\s*:\s*(.+)$/i)
  if (labeled && /[,;]/.test(labeled[1]!)) {
    return labeled[1]!
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return [line]
}

const LOOSE_MOVEMENT =
  /\b(press|squat|deadlift|hinge|row|curl|raise|flye?|lunge|plank|hold|carry|pull|push(?:-?up)?|extension|crunch|twist|stretch|walk|swing|thrust|dip|chin|hang|pulldown|pullover|face\s*pull|kickback|abduction|adduction|calf|glute|hip|core|dead\s*bug|bird\s*dog|pallof)\b/i

/** Names without "sets x reps" still belong on the tracker (core finishers, holds, A1/A2). */
function parseLooseExerciseLine(
  line: string,
  phase: WorkoutExercisePhase,
  index: number
): TrackerExerciseItem | null {
  const trimmed = stripExerciseListPrefix(
    stripMarkdownDecorators(line.replace(/^[-*•]\s*/, '').trim())
  )
  if (!trimmed || trimmed.startsWith('#')) return null
  if (/^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(trimmed)) {
    return null
  }
  if (PHASE_HEADERS.test(trimmed) || SESSION_LABEL_ONLY.test(trimmed)) return null
  if (isCoachingExerciseName(trimmed)) return null
  if (/^(note|notes|rest|optional|superset|circuit|round|then|also|hint)\b/i.test(trimmed)) {
    return null
  }
  if (/\b(should|ensure|remember|make sure|client|coach)\b/i.test(trimmed)) return null
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (trimmed.length < 3 || trimmed.length > 70 || words.length > 10) return null
  const allowLoose =
    phase !== 'main' || LOOSE_MOVEMENT.test(trimmed) || /^(?:[A-Za-z]\d+[.)]|\d+[.)])/.test(line.trim())
  if (!allowLoose) return null

  return withTrackingMeta({
    id: `ex-${phase}-${slug(trimmed)}-${index}`,
    name: trimmed.replace(/[.:]+$/, '').trim(),
    targetSets: phase === 'cooldown' || phase === 'warmup' ? 1 : 3,
    targetReps: phase === 'cooldown' || phase === 'warmup' ? 'as needed' : '8-12',
    phase,
    restSeconds: phase === 'main' ? 60 : 30,
  })
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
      const dayFocusMatch = trimmed.match(DAY_SESSION_HEADER)
      if (dayFocusMatch) {
        dayLabel = resolvePlanDayMeta(
          dayFocusMatch[1] || dayFocusMatch[2]!,
          dayFocusMatch[3]
        ).label
        focus = dayFocusMatch[4]!.trim().replace(/\*+$/, '').trim()
        headerConsumed = true
        continue
      }
      const dayOnly = trimmed.match(
        /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day\s*\d+)\s*$/i
      )
      if (dayOnly) {
        dayLabel = toProgramDayLabel(dayOnly[1]!)
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

    // Next-day header leaked into this block (common after Post-Workout) — stop parsing.
    if (
      headerConsumed &&
      (DAY_SESSION_HEADER.test(trimmed) ||
        /^(?:#{1,3}\s*)?(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
          trimmed
        ))
    ) {
      break
    }

    if (PHASE_HEADERS.test(trimmed) || SESSION_LABEL_ONLY.test(trimmed)) {
      const key = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/:$/, '')
      if (PHASE_HEADERS.test(trimmed)) {
        currentPhase = PHASE_MAP[key] ?? 'main'
      }
      continue
    }

    // "Post-workout: walk, then hip flexor stretches" (header + content on one line)
    const inlinePhase = trimmed.match(
      /^(?:#{1,3}\s*)?(warm[- ]?up|pre[- ]?workout|activation|mobility|prep|main(?:\s+workout)?|cool[- ]?down|post[- ]?workout(?:\s+stretching)?|stretching|recovery|finisher)\s*[:\-–—]\s+(.+)$/i
    )
    if (inlinePhase) {
      const key = inlinePhase[1]!.toLowerCase().replace(/\s+/g, ' ')
      currentPhase = PHASE_MAP[key] ?? currentPhase
      const rest = inlinePhase[2]!.trim()
      let matchedInline = false
      for (const candidate of expandCompositeExerciseLines(rest)) {
        const exercise =
          parseExerciseLine(candidate, currentPhase, exerciseIndex) ??
          parseLooseExerciseLine(candidate, currentPhase, exerciseIndex)
        if (exercise) {
          addExercise(exercise)
          matchedInline = true
        }
      }
      if (!matchedInline && rest.length > 8) {
        for (const narrative of parseNarrativeMovementList(rest, currentPhase, `inline-${currentPhase}`)) {
          addExercise({
            ...narrative,
            id: `ex-${currentPhase}-${slug(narrative.name)}-${exerciseIndex}`,
          })
        }
      }
      continue
    }

    let matchedExercise = false
    for (const candidate of expandCompositeExerciseLines(trimmed)) {
      const exercise =
        parseExerciseLine(candidate, currentPhase, exerciseIndex) ??
        parseLooseExerciseLine(candidate, currentPhase, exerciseIndex)
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

  rehomeLeakedPhaseBuckets(phaseBuckets)

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

function splitWorkoutDayBlocks(workoutText: string): (TrackerPlanDayOption & { body: string })[] {
  if (!workoutText.trim()) return []

  const blocks = workoutText.split(
    /\n(?=(?:\*{0,2}|#{1,3}\s*)?(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i
  )

  const days: (TrackerPlanDayOption & { body: string })[] = []
  for (const block of blocks) {
    const first = stripMarkdownDecorators(block.split('\n')[0] ?? '').trim()
    const dayMatch = first.match(
      /^(?:(day\s*\d+)|(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b(?:\s*[(\[–—:-]+\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday))?/i
    )
    if (!dayMatch) continue
    const dayToken = (dayMatch[1] || dayMatch[2] || '').toLowerCase().replace(/\s+/g, ' ')
    const weekdayHint = dayMatch[3]?.toLowerCase()
    const { key, label, calendarAligned } = resolvePlanDayMeta(dayToken, weekdayHint)
    days.push({ key, label, calendarAligned, body: block.trim() })
  }

  if (days.length > 0) return days
  return [{ key: 'default', label: 'Today', calendarAligned: false, body: workoutText.trim() }]
}

function isCalendarAlignedPlan(days: Pick<TrackerPlanDayOption, 'key' | 'calendarAligned'>[]): boolean {
  return days.some((d) => d.calendarAligned === true || WEEKDAY_PROGRAM_DAY[d.key] != null)
}

/** Suggest which plan day matches today (IST weekday / Day N). */
export function suggestedWorkoutDayKey(
  days: TrackerPlanDayOption[],
  referenceDate = new Date(),
  options?: { coachingDayInWeek?: number }
): string | null {
  if (days.length === 0) return null

  const dayName = getIstWeekdayName(referenceDate)
  const calendarAligned = isCalendarAlignedPlan(days)

  // Legacy / hybrid plans keep weekday keys (monday…) even when labels show Day 1…
  const byWeekday = days.find((d) => d.key === dayName)
  if (byWeekday) return byWeekday.key

  // Labels that name today's weekday (e.g. "Day 4 (Thursday)") — only for calendar-bound plans.
  if (calendarAligned) {
    const byLabelWeekday = days.find((d) => new RegExp(`\\b${dayName}\\b`, 'i').test(d.label))
    if (byLabelWeekday) return byLabelWeekday.key
  }

  const weekdayAligned = calendarAligned

  const calendarProgramDay = WEEKDAY_PROGRAM_DAY[dayName]
  const coachingDay = options?.coachingDayInWeek

  // Bare Day N (no weekday in labels): prefer coaching day-in-week when available.
  // Weekday-aligned plans (Day 1 = Monday): use calendar Monday = Day 1.
  const preferredDay =
    !weekdayAligned && coachingDay && coachingDay >= 1 && coachingDay <= 7
      ? coachingDay
      : calendarProgramDay

  if (preferredDay && preferredDay >= 1 && preferredDay <= 7) {
    const byPreferred =
      days.find((d) => d.key === `day-${preferredDay}` || d.key === slug(`day ${preferredDay}`)) ??
      days.find((d) => new RegExp(`\\bday\\s*${preferredDay}\\b`, 'i').test(d.label))
    if (byPreferred) return byPreferred.key
  }

  // Last resort: the other numbering scheme if the preferred one missed.
  const fallbackDay =
    preferredDay === coachingDay ? calendarProgramDay : coachingDay
  if (fallbackDay && fallbackDay >= 1 && fallbackDay <= 7 && fallbackDay !== preferredDay) {
    const byFallback =
      days.find((d) => d.key === `day-${fallbackDay}` || d.key === slug(`day ${fallbackDay}`)) ??
      days.find((d) => new RegExp(`\\bday\\s*${fallbackDay}\\b`, 'i').test(d.label))
    if (byFallback) return byFallback.key
  }

  return null
}

/** Remap a previous workout-day selection onto a rebuilt snapshot's day keys. */
export function remapWorkoutDayKey(
  previousKey: string | null | undefined,
  days: TrackerPlanDayOption[]
): string | undefined {
  if (!previousKey || days.length === 0) return undefined
  if (days.some((d) => d.key === previousKey)) return previousKey

  const prev = previousKey.toLowerCase()
  const dayNum = prev.match(/^day-(\d+)$/)?.[1]
  if (dayNum) {
    const byNum =
      days.find((d) => d.key === `day-${dayNum}`) ??
      days.find((d) => new RegExp(`\\bday\\s*${dayNum}\\b`, 'i').test(d.label))
    if (byNum) return byNum.key
  }

  if ((DAY_NAMES as readonly string[]).includes(prev)) {
    const byKey = days.find((d) => d.key === prev)
    if (byKey) return byKey.key
    const byLabel = days.find((d) => d.label.toLowerCase().includes(prev))
    if (byLabel) return byLabel.key
    const programDay = WEEKDAY_PROGRAM_DAY[prev]
    if (programDay) {
      const byProgramDay =
        days.find((d) => d.key === `day-${programDay}`) ??
        days.find((d) => new RegExp(`\\bday\\s*${programDay}\\b`, 'i').test(d.label))
      if (byProgramDay) return byProgramDay.key
    }
  }

  const bySharedWeekday = days.find((d) =>
    DAY_NAMES.some(
      (name) =>
        (prev === name || prev.includes(name) || new RegExp(`\\b${name}\\b`, 'i').test(prev)) &&
        (d.key === name || d.label.toLowerCase().includes(name))
    )
  )
  return bySharedWeekday?.key
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
  workoutDays: TrackerPlanDayOption[]
} {
  if (!workoutText.trim()) return { workouts: [], workoutDays: [] }

  const sharedWarmup = extractSharedPhaseExercises(workoutText, 'warmup')
  const sharedCooldown = extractSharedPhaseExercises(workoutText, 'cooldown')
  const blocks = splitWorkoutDayBlocks(workoutText)
  const workouts: TrackerWorkoutItem[] = []
  const workoutDays: TrackerPlanDayOption[] = []

  for (const day of blocks) {
    const parsed = parseWorkoutPhases(day.body)
    const dayLabel = parsed.dayLabel ?? day.label
    // Detect rest/empty before default warm-ups are injected — otherwise Rest days
    // look like normal sessions and disappear from the picker inconsistently.
    // Only treat as Rest when the day is empty AND looks like a rest day (or has no
    // training-like title). Failed exercise parses on "Lower Power" etc. must not
    // all collapse into Rest day.
    const looksLikeRestDay = isExplicitRestDayText(`${day.label}\n${day.body}`)
    const isRestDay =
      parsed.exercises.length === 0 && day.key !== 'default' && looksLikeRestDay

    if (isRestDay) {
      workouts.push({
        id: `workout-${day.key}`,
        type: 'workout',
        period: 'workout',
        icon: '🛌',
        title: `${dayLabel} — Rest`,
        dayLabel,
        focus: 'Rest day',
        workoutNotes: parsed.workoutNotes,
        workoutDay: day.key,
        workoutDayLabel: day.label,
        phases: [],
        exercises: [],
        sortOrder: 50,
      })
      workoutDays.push({ key: day.key, label: day.label, calendarAligned: day.calendarAligned })
      continue
    }

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
      workoutDays.push({ key: day.key, label: day.label, calendarAligned: day.calendarAligned })
    }
  }

  return { workouts, workoutDays }
}

function parseWorkoutFocus(section: string): string | undefined {
  const firstLine = section.split('\n').find((l) => l.trim())?.trim() ?? ''
  if (!firstLine) return undefined
  const withoutDay = firstLine
    .replace(/^#{1,3}\s*/, '')
    .replace(DAY_SESSION_HEADER, '$4')
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

/**
 * Text that sits outside per-day workout bodies (usually a preamble before Day 1 /
 * Monday). In-day Post-Workout blocks must NOT be treated as shared — that was
 * swallowing the next day's main lifts into every day's cooldown.
 */
function workoutSharedRegions(fullWorkout: string): string {
  const text = fullWorkout.replace(/\r\n/g, '\n')
  const dayStart = text.search(
    new RegExp(`(?:^|\\n)(?=${DAY_HEADER_BOUNDARY})`, 'i')
  )
  if (dayStart < 0) return ''
  // Prefer preamble only. Trailing shared blocks after the last day are uncommon
  // and would otherwise sit inside the last day body with the current splitter.
  return text.slice(0, dayStart).trim()
}

/** Strength compounds accidentally captured into warmup/cooldown are moved back to main. */
function looksLikeStrengthMovement(name: string): boolean {
  const n = name.toLowerCase()
  if (
    /\b(stretch|mobility|foam\s*roll|breathing|cool\s*down|walk|pose|hold|circle|swing|opener)\b/i.test(
      n
    )
  ) {
    return false
  }
  return /\b(bench|squat|deadlift|press|row|pull[- ]?up|chin[- ]?up|lunge|rdl|hip\s*thrust|curl|extension|flye?|raise|pulldown|pushdown|kickback|dip|hack\s*squat|leg\s*press|tricep|bicep|shrug|clean|snatch|split\s*squat|step[- ]?up|good\s*morning|lat\s*pulldown|face\s*pull|skull\s*crush|overhead)\b/i.test(
    n
  )
}

function looksLikeMainLiftInCooldown(ex: TrackerExerciseItem): boolean {
  if (!looksLikeStrengthMovement(ex.name)) return false
  const sets = ex.targetSets ?? 0
  const reps = String(ex.targetReps ?? '')
  const timedStretch = /\b(\d+\s*s|\d+\s*sec|hold|seconds?)\b/i.test(reps) || /\b\d+\s*s\b/i.test(ex.name)
  if (timedStretch) return false
  return sets >= 2 || Boolean(reps && /^\d/.test(reps))
}

function looksLikeWorkingLiftInWarmup(ex: TrackerExerciseItem): boolean {
  if (
    /\b(circle|swing|walk|jog|jacks|skip|cat.?cow|inchworm|opener|mobility|arm circles|leg swings|jumping jack)\b/i.test(
      ex.name
    )
  ) {
    return false
  }
  if (!looksLikeStrengthMovement(ex.name)) return false
  const sets = ex.targetSets ?? 0
  const lightActivation =
    /\b(bodyweight|air squat|glute bridge|band pull|pull.?apart)\b/i.test(ex.name) && sets <= 2
  if (lightActivation) return false
  if (sets >= 3) return true
  return (
    sets >= 2 &&
    /\b(barbell|dumbbell|cable|machine|smith|ez[- ]?bar|kettlebell|goblet|pushdown|pulldown|rdl|deadlift|bench|hip\s*thrust|hack\s*squat|leg\s*press|tricep|bicep)\b/i.test(
      ex.name
    )
  )
}

function rehomeLeakedPhaseBuckets(phaseBuckets: Map<WorkoutExercisePhase, TrackerExerciseItem[]>) {
  const warmup = phaseBuckets.get('warmup') ?? []
  const cooldown = phaseBuckets.get('cooldown') ?? []
  const leakedWarm = warmup.filter(looksLikeWorkingLiftInWarmup)
  const keepWarm = warmup.filter((ex) => !looksLikeWorkingLiftInWarmup(ex))
  const leakedCool = cooldown.filter(looksLikeMainLiftInCooldown)
  const keepCool = cooldown.filter((ex) => !looksLikeMainLiftInCooldown(ex))
  if (keepWarm.length) phaseBuckets.set('warmup', keepWarm)
  else phaseBuckets.delete('warmup')
  if (keepCool.length) phaseBuckets.set('cooldown', keepCool)
  else phaseBuckets.delete('cooldown')
  if (leakedWarm.length === 0 && leakedCool.length === 0) return
  const main = phaseBuckets.get('main') ?? []
  phaseBuckets.set('main', [
    ...leakedWarm.map((ex) => ({ ...ex, phase: 'main' as const })),
    ...main,
    ...leakedCool.map((ex) => ({ ...ex, phase: 'main' as const })),
  ])
}

function sharedPhasePatterns(phase: 'warmup' | 'cooldown'): RegExp[] {
  const dayBoundary = DAY_HEADER_BOUNDARY
  if (phase === 'warmup') {
    return [
      new RegExp(
        `(?:before every session[^\\n]*warmup|warmup routine|warm[- ]?up(?:\\s+routine)?)[:\\s]+([\\s\\S]+?)(?=\\n\\s*\\n(?:here's how|here is how|${dayBoundary})|$)`,
        'i'
      ),
      new RegExp(
        `(?:##\\s*)?warmup[^\\n]*\\n([\\s\\S]+?)(?=\\n\\s*##|\\n\\s*(?:\\*{0,2})?(?:${dayBoundary})|$)`,
        'i'
      ),
    ]
  }
  return [
    new RegExp(
      `(?:^|\\n)(?:#{1,3}\\s*|\\*{0,2})?(?:post[- ]?workout|cool[- ]?down|cooldown)(?:\\s+(?:routine|stretching))?\\*{0,2}\\s*[:\\-–—]\\s*([\\s\\S]+?)(?=\\n\\s*(?:${dayBoundary}|breakfast)|\\n\\s*\\n\\s*\\n|$)`,
      'im'
    ),
    // CRITICAL: must stop at weekday headers too — previously only Day N / ## stopped,
    // so "Post-Workout\\n...\\nTuesday — Bench..." swallowed the next day's lifts.
    new RegExp(
      `(?:##\\s*)?(?:post[- ]?workout|cool[- ]?down|cooldown)[^\\n]*\\n([\\s\\S]+?)(?=\\n\\s*##|\\n\\s*(?:\\*{0,2})?(?:${dayBoundary})|$)`,
      'i'
    ),
  ]
}

function parseSharedPhaseBlock(
  block: string,
  phase: 'warmup' | 'cooldown'
): TrackerExerciseItem[] {
  const structured = parseWorkoutPhases(
    `${phase === 'warmup' ? 'Warm-up' : 'Post-Workout'}\n${block}`
  ).exercises.filter((ex) => ex.phase === phase || ex.phase === 'main')

  if (structured.length > 0) {
    return structured
      .filter((ex) => !/steps|intensity|rep ranges/i.test(ex.name))
      .filter((ex) => ex.phase === phase)
      .filter((ex) => !(phase === 'cooldown' && looksLikeMainLiftInCooldown(ex)))
      .filter((ex) => !(phase === 'warmup' && looksLikeWorkingLiftInWarmup(ex)))
      .map((ex, idx) => ({
        ...ex,
        phase,
        id: `ex-${phase}-shared-${slug(ex.name)}-${idx}`,
        restSeconds: ex.restSeconds ?? (phase === 'warmup' ? 30 : 45),
      }))
  }

  return parseNarrativeMovementList(block, phase, `${phase}-shared`).filter(
    (ex) => !(phase === 'cooldown' && looksLikeMainLiftInCooldown(ex))
  )
}

/** Pull shared warm-up / post-workout blocks from the overall plan (outside day lists). */
function extractSharedPhaseExercises(
  fullWorkout: string,
  phase: 'warmup' | 'cooldown'
): TrackerExerciseItem[] {
  const normalized = fullWorkout.replace(/\r\n/g, '\n')
  // Only preamble (before first day). Never scan the full plan — in-day Post-Workout
  // blocks were being treated as shared and leaking the next day's lifts.
  const regions = [workoutSharedRegions(normalized)]
  const patterns = sharedPhasePatterns(phase)

  for (const text of regions) {
    if (!text.trim()) continue
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (!match?.[1]) continue
      const parsed = parseSharedPhaseBlock(match[1].trim(), phase)
      if (parsed.length > 0) return parsed
    }
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

  const dayHasWarmup = dayPhases.some((p) => p.phase === 'warmup' && p.exercises.length > 0)
  const dayHasCooldown = dayPhases.some((p) => p.phase === 'cooldown' && p.exercises.length > 0)

  // Prefer the day's own warm-up when present; otherwise apply shared preamble warmup.
  if (!dayHasWarmup) {
    for (const ex of sharedWarmup) add(ex)
  }
  for (const block of dayPhases) {
    for (const ex of block.exercises) add(ex)
  }
  // Day exercises not already in blocks (shouldn't happen)
  for (const ex of dayExercises) {
    const exists = (byPhase.get(ex.phase) ?? []).some((e) => e.id === ex.id)
    if (!exists) add(ex)
  }
  // Never append shared cooldown when the day already has its own Post-Workout —
  // that was how next-day compounds leaked into today's stretches.
  if (!dayHasCooldown) {
    for (const ex of sharedCooldown) {
      if (!looksLikeMainLiftInCooldown(ex)) add(ex)
    }
  }

  // Drop / rehome strength compounds that still landed in the wrong folder.
  rehomeLeakedPhaseBuckets(byPhase)

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

/** Stable fingerprint of plan section text so tracker rebuilds when content changes. */
export function planContentSignature(plan: Pick<
  Plan,
  'nutrition_plan' | 'workout_plan' | 'cardio_plan' | 'supplement_plan' | 'coach_notes' | 'title' | 'phase'
>): string {
  const normalize = (value: string | null | undefined) =>
    (value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim()

  return [
    `title:${normalize(plan.title)}`,
    `phase:${normalize(plan.phase)}`,
    `diet:${normalize(plan.nutrition_plan)}`,
    `workout:${normalize(plan.workout_plan)}`,
    `cardio:${normalize(plan.cardio_plan)}`,
    `supp:${normalize(plan.supplement_plan)}`,
    `notes:${normalize(plan.coach_notes)}`,
  ].join('\n')
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
    parserVersion: TRACKER_PARSER_VERSION,
    planUpdatedAt: plan.updated_at,
    planContentSignature: planContentSignature(plan),
    items,
    dietDays: dietDays.length > 0 ? dietDays : undefined,
    workoutDays: workoutDays.length > 0 ? workoutDays : undefined,
  }
}

function mergeSetLog(
  prev: NonNullable<TrackerCompletion['exercises']>[string]['sets'][number] | undefined,
  next: NonNullable<TrackerCompletion['exercises']>[string]['sets'][number] | undefined
): NonNullable<TrackerCompletion['exercises']>[string]['sets'][number] {
  const out: NonNullable<TrackerCompletion['exercises']>[string]['sets'][number] = {
    ...(prev ?? {}),
  }
  if (!next) return out

  // Explicit null clears; missing key keeps previous; number overwrites.
  const applyField = <K extends keyof typeof out>(key: K) => {
    if (!Object.prototype.hasOwnProperty.call(next, key)) return
    const value = next[key]
    if (value === null) {
      delete out[key]
      return
    }
    if (value !== undefined) {
      out[key] = value
    }
  }

  applyField('reps')
  applyField('weight')
  applyField('rpe')
  applyField('durationSeconds')
  applyField('distanceMeters')
  if (Object.prototype.hasOwnProperty.call(next, 'completed')) {
    out.completed = next.completed
  }
  return out
}

/** After a new plan is delivered, drop frozen day picks so diet/workout show the updated week. */
export function dropSelectedDaysForPlanChange(completion: TrackerCompletion): TrackerCompletion {
  const next = { ...completion }
  delete next.selectedDietDay
  delete next.selectedWorkoutDay
  return next
}

export function mergeCompletion(previous: TrackerCompletion, next: TrackerCompletion): TrackerCompletion {
  const mergeExercises = (
    prevMap: TrackerCompletion['exercises'],
    nextMap: TrackerCompletion['exercises']
  ): TrackerCompletion['exercises'] => {
    if (!nextMap) return prevMap
    if (!prevMap) return nextMap
    const out = { ...prevMap }
    for (const [id, nextEx] of Object.entries(nextMap)) {
      const prevEx = prevMap[id]
      if (!prevEx) {
        out[id] = nextEx
        continue
      }
      const setCount = Math.max(prevEx.sets?.length ?? 0, nextEx.sets?.length ?? 0)
      const sets = Array.from({ length: setCount }, (_, index) =>
        mergeSetLog(prevEx.sets?.[index], nextEx.sets?.[index])
      )
      out[id] = {
        ...prevEx,
        ...nextEx,
        sets,
        notes: nextEx.notes !== undefined ? nextEx.notes : prevEx.notes,
      }
    }
    return out
  }

  const mergeSleep = (
    prev: TrackerCompletion['sleep'],
    nextSleep: TrackerCompletion['sleep']
  ): TrackerCompletion['sleep'] => {
    if (!nextSleep) return prev
    if (!prev) return withDerivedSleepHours(nextSleep)
    const out = { ...prev }
    for (const key of Object.keys(nextSleep) as (keyof NonNullable<TrackerCompletion['sleep']>)[]) {
      if (!Object.prototype.hasOwnProperty.call(nextSleep, key)) continue
      const value = nextSleep[key]
      if (value === null) {
        delete out[key]
      } else if (value !== undefined) {
        ;(out as Record<string, unknown>)[key] = value
      }
    }
    return withDerivedSleepHours(out)
  }

  return {
    meals: { ...previous.meals, ...next.meals },
    exercises: mergeExercises(previous.exercises, next.exercises),
    cardio: { ...previous.cardio, ...next.cardio },
    supplements: { ...previous.supplements, ...next.supplements },
    water: next.water ?? previous.water,
    sleep: mergeSleep(previous.sleep, next.sleep),
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
    wearable:
      next.wearable === null
        ? undefined
        : next.wearable !== undefined
          ? { ...previous.wearable, ...next.wearable }
          : previous.wearable,
  }
}
