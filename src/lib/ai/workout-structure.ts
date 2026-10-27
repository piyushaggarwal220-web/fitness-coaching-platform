/**
 * Weekly workout updates were rewriting the week from scratch.
 * These checks stop a plan that repeats the same lifts on back-to-back days,
 * drops direct arm work, or lets leg work collapse.
 */

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

const DAY_SPLIT =
  /(?:^|\n)\s*(?:day\s*\d+\s*\(\s*)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi

const SET_LINE = /(\d+)\s*sets?\s*x\b/i
const ARM_MOVE =
  /\b(curl|tricep|triceps|bicep|biceps|pushdown|push down|skull|kickback|preacher|overhead extension)\b/i
const LEG_MOVE =
  /\b(squat|leg press|lunge|rdl|romanian|deadlift|leg curl|leg extension|hip thrust|split squat|bulgarian|step up|hack squat|goblet|good morning|calf)\b/i
const UPPER_MOVE =
  /\b(bench|overhead press|shoulder press|row|pulldown|pull down|pullup|pull up|push up|pushup|fly|lateral raise|face pull)\b/i

export type WorkingExercise = {
  name: string
  sets: number
  arm: boolean
  leg: boolean
}

export type TrainingDay = {
  weekday: string
  exercises: WorkingExercise[]
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(barbell|dumbbell|machine|cable|smith|resistance|band|kettlebell|ez)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isNonWorkingLine(line: string): boolean {
  return /\b(warm[\s-]?up|stretch|mobility|very light|groove|foam|cool down|post[\s-]?workout|rest day|active recovery)\b/i.test(
    line
  )
}

function exerciseFromLine(line: string): WorkingExercise | null {
  if (isNonWorkingLine(line)) return null
  const setsMatch = line.match(SET_LINE)
  if (!setsMatch) return null
  const rawName = line.split(':')[0]?.trim() || line
  const name = normalizeName(rawName)
  if (!name || name.length < 3) return null
  const sets = Number(setsMatch[1])
  if (!Number.isFinite(sets) || sets <= 0) return null
  return {
    name,
    sets,
    arm: ARM_MOVE.test(line) && !/\bleg curl\b/i.test(line),
    leg: LEG_MOVE.test(line),
  }
}

/** Training days in calendar order. Rest days with no working sets are left out. */
export function parseTrainingDays(text: string): TrainingDay[] {
  if (!text?.trim()) return []
  const marks: { index: number; weekday: string }[] = []
  const re = new RegExp(DAY_SPLIT.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    marks.push({ index: match.index, weekday: match[1].toLowerCase() })
  }
  const days: TrainingDay[] = []
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].index
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    const body = text.slice(start, end)
    const main = body.split(/post[\s-]?workout\s*:/i)[0] ?? body
    const afterWarmup = main.split(/main workout\s*:/i)
    const working = afterWarmup.length > 1 ? afterWarmup.slice(1).join('\n') : main
    const exercises = working
      .split(/\n/)
      .map((line) => exerciseFromLine(line))
      .filter((row): row is WorkingExercise => Boolean(row))
    if (exercises.length === 0) continue
    const existing = days.find((day) => day.weekday === marks[i].weekday)
    if (existing) existing.exercises.push(...exercises)
    else days.push({ weekday: marks[i].weekday, exercises })
  }
  return days.sort(
    (a, b) => WEEKDAYS.indexOf(a.weekday as (typeof WEEKDAYS)[number]) - WEEKDAYS.indexOf(b.weekday as (typeof WEEKDAYS)[number])
  )
}

function setCount(days: TrainingDay[], kind: 'arm' | 'leg'): number {
  return days.reduce(
    (sum, day) => sum + day.exercises.filter((exercise) => exercise[kind]).reduce((inner, exercise) => inner + exercise.sets, 0),
    0
  )
}

function waives(note: string | null | undefined, pattern: RegExp): boolean {
  return pattern.test(note ?? '')
}

export function assessWorkoutStructure(
  nextText: string,
  previousText?: string | null,
  note?: string | null
): string[] {
  const next = parseTrainingDays(nextText)
  if (next.length === 0) return []
  const previous = parseTrainingDays(previousText ?? '')
  const errors: string[] = []

  for (let i = 0; i < next.length; i += 1) {
    const day = next[i]
    const other = next[i + 1] ?? (i === next.length - 1 ? next[0] : undefined)
    if (!other || other === day) continue
    const a = WEEKDAYS.indexOf(day.weekday as (typeof WEEKDAYS)[number])
    const b = WEEKDAYS.indexOf(other.weekday as (typeof WEEKDAYS)[number])
    const gap = (b - a + 7) % 7
    if (gap !== 1) continue
    const names = new Set(day.exercises.map((exercise) => exercise.name))
    const shared = other.exercises.map((exercise) => exercise.name).filter((name) => names.has(name))
    const unique = [...new Set(shared)]
    if (unique.length >= 2) {
      errors.push(
        `${day.weekday} and ${other.weekday} repeat ${unique.slice(0, 3).join(', ')}. Do not put the same working lifts on back-to-back days.`
      )
    }
  }

  const nextArms = setCount(next, 'arm')
  const prevArms = setCount(previous, 'arm')
  const trainsUpper = next.some((day) => day.exercises.some((exercise) => UPPER_MOVE.test(exercise.name) || exercise.arm))
  const skipArms = waives(note, /\b(no arms|skip arms|no curls|elbow pain|elbow)\b/i)
  const easing = waives(note, /\b(easier|deload|lighter week|less volume|cut the volume)\b/i)
  if (!skipArms && !easing && trainsUpper) {
    const floor = prevArms >= 4 ? Math.max(4, Math.floor(prevArms * 0.5)) : 4
    if (nextArms < floor) {
      errors.push(
        `Arm work is too low (${nextArms} direct sets, need at least ${floor}). Keep a curl and a triceps exercise in the week.`
      )
    }
  }

  const nextLegs = setCount(next, 'leg')
  const prevLegs = setCount(previous, 'leg')
  const skipLegs = waives(note, /\b(no legs|skip legs|do not train legs|knee pain|no squat)\b/i)
  if (!skipLegs && !easing && (prevLegs >= 6 || next.length >= 3)) {
    const floor = prevLegs >= 6 ? Math.max(6, Math.floor(prevLegs * 0.6)) : 6
    if (nextLegs < floor) {
      errors.push(
        `Leg work is too low (${nextLegs} sets, need at least ${floor}). Keep a squat or leg press and a hinge.`
      )
    }
  }

  return errors
}
