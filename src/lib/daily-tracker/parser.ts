import { resolvePlanSectionsFromPlan } from '@/lib/plan-section-parser'
import type { OnboardingProfile, Plan } from '@/types/database'
import type {
  TrackerCardioItem,
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
  TrackerCompletion,
} from './types'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

function parseMeals(diet: string): TrackerMealItem[] {
  if (!diet.trim()) return []
  const lines = diet.replace(/\r\n/g, '\n').split('\n')
  const meals: TrackerMealItem[] = []
  const headers = /^(?:#{1,3}\s*)?(breakfast|lunch|dinner|snack|morning meal|evening meal|pre-workout|post-workout)\s*:?\s*$/i
  const periodMap: Record<string, TrackerPeriod> = {
    breakfast: 'morning',
    'morning meal': 'morning',
    'pre-workout': 'morning',
    lunch: 'lunch',
    snack: 'afternoon',
    dinner: 'evening',
    'evening meal': 'evening',
    'post-workout': 'evening',
  }

  let current: { name: string; lines: string[] } | null = null
  const flush = () => {
    if (!current) return
    const foods = current.lines.join('\n').trim()
    if (!foods) return
    const key = current.name.toLowerCase()
    meals.push({
      id: `meal-${slug(current.name)}`,
      type: 'meal',
      period: periodMap[key] ?? 'lunch',
      icon: '🥗',
      title: current.name.replace(/\b\w/g, (c) => c.toUpperCase()),
      foods,
      sortOrder: meals.length,
    })
    current = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(headers)
    if (match) {
      flush()
      current = { name: match[1]!, lines: [] }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()

  if (meals.length === 0 && diet.trim()) {
    meals.push({
      id: 'meal-daily-nutrition',
      type: 'meal',
      period: 'morning',
      icon: '🥗',
      title: 'Daily Nutrition',
      foods: diet.trim(),
      sortOrder: 0,
    })
  }

  return meals
}

function parseExercises(text: string): TrackerExerciseItem[] {
  const exercises: TrackerExerciseItem[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const pattern =
    /^[-*•]?\s*(.+?)\s+(\d+)\s*[x×]\s*(\d+(?:-\d+)?)(?:\s*(?:@|at)\s*([\d.]+)\s*(?:kg|lbs?))?/i

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(pattern)
    if (!match) continue
    const name = match[1]!.trim()
    exercises.push({
      id: `ex-${slug(name)}`,
      name,
      targetSets: Number(match[2]),
      targetReps: match[3]!,
      targetWeight: match[4] ? `${match[4]} kg` : undefined,
    })
  }

  return exercises
}

function pickWorkoutForToday(workoutText: string, referenceDate = new Date()): string {
  if (!workoutText.trim()) return ''
  const dayName = DAY_NAMES[referenceDate.getDay()]!
  const blocks = workoutText.split(/\n(?=(?:#{1,3}\s*)?(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i)
  if (blocks.length <= 1) return workoutText

  const match = blocks.find((block) => {
    const first = block.split('\n')[0]?.toLowerCase() ?? ''
    return first.includes(dayName) || first.includes(`day ${referenceDate.getDay() || 7}`)
  })
  return match?.trim() || blocks[0]!.trim()
}

function parseWorkout(workout: string, referenceDate = new Date()): TrackerWorkoutItem | null {
  const section = pickWorkoutForToday(workout, referenceDate)
  const exercises = parseExercises(section)
  if (exercises.length === 0 && !section.trim()) return null

  return {
    id: 'workout-today',
    type: 'workout',
    period: 'workout',
    icon: '🏋',
    title: exercises.length > 0 ? "Today's Workout" : 'Training',
    exercises:
      exercises.length > 0
        ? exercises
        : [{ id: 'ex-session', name: 'Complete training session', targetSets: 1, targetReps: '1' }],
    sortOrder: 50,
  }
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
  return lines.map((line) => {
    const lower = line.toLowerCase()
    let period: TrackerPeriod = 'morning'
    if (lower.includes('evening') || lower.includes('pm')) period = 'evening'
    if (lower.includes('night') || lower.includes('bed')) period = 'night'
    const doseMatch = line.match(/(\d+\s*(?:mg|g|iu|ml|scoop[s]?)[^.]*)/i)
    return {
      id: `supp-${slug(line)}`,
      type: 'supplement',
      period,
      icon: '💊',
      title: line.split(/[-–—:]/)[0]?.trim() || line,
      dose: doseMatch?.[1],
      sortOrder: period === 'morning' ? 5 : period === 'evening' ? 70 : 90,
    }
  })
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

  for (const meal of parseMeals(sections.diet)) items.push(meal)
  const workout = parseWorkout(sections.workout, referenceDate)
  if (workout) items.push(workout)
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
    items,
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
  }
}
