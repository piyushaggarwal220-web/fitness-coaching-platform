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
const LEG_CURL = /\b(leg|hamstring|lying|nordic)\s+curl\b/i
const LEG_MOVE =
  /\b(squat|leg press|lunge|rdl|romanian|deadlift|leg curl|hamstring curl|leg extension|hip thrust|glute bridge|pull through|split squat|bulgarian|step up|hack squat|goblet|good morning|calf)\b/i
const UPPER_MOVE =
  /\b(bench|chest press|floor press|incline press|decline press|overhead press|shoulder press|row|pulldown|pull down|pullup|pull up|push up|pushup|fly|lateral raise|face pull|pushdown|push down|dip|pullover)\b/i
const CORE_MOVE =
  /\b(plank|dead bug|wood chop|pallof|crunch|sit up|sit-up|bird dog|ab wheel|hollow|russian twist)\b/i

export type WorkingExercise = {
  name: string
  label: string
  sets: number
  arm: boolean
  leg: boolean
}

/** Ordinary moves a person can search on YouTube. Equipment words are stripped first. */
const COMMON_EXERCISE =
  /\b(bench press|chest press|floor press|push ups?|press ups?|dips?|flye?s?|pec deck|overhead press|shoulder press|military press|lateral raises?|front raises?|face pulls?|shrugs?|upright rows?|rows?|pulldowns?|pull downs?|pull ups?|chin ups?|pullovers?|curls?|pushdowns?|push downs?|tricep extensions?|triceps extensions?|overhead extensions?|back extensions?|hyperextensions?|kickbacks?|squats?|leg press|lunges?|split squats?|step ups?|romanian deadlifts?|deadlifts?|hip thrusts?|glute bridges?|leg curls?|hamstring curls?|leg extensions?|calf raises?|good mornings?|hack squats?|planks?|crunches?|sit ups?|dead bugs?|bird dogs?|leg raises?|mountain climbers?|hip abductions?|hip adductions?|swings?|wall sits?|donkey kicks?|supermans?)\b/i

/** A real move with a made-up setup is still a custom exercise. */
const CUSTOM_EXERCISE =
  /\b(tempo|paused?|deficit|pulses?|isometric|mechanical|complex|flow|combo|circuit|custom|special|unique|meadows?|pendlay|zercher|snatch|turkish|jefferson|copenhagen|renegade|landmine|nordic|sots|anderson|spoto|larsen|elevated|eccentric|half kneeling|tall kneeling|anti rotation|with|coach)\b|\bto\b/i

export function isCommonYouTubeExercise(name: string): boolean {
  const key = name.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!key || CUSTOM_EXERCISE.test(key)) return false
  return COMMON_EXERCISE.test(key)
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
    label: rawName.replace(/^[-*•]\s*/, '').trim(),
    sets,
    arm: ARM_MOVE.test(line) && !LEG_CURL.test(line),
    leg: LEG_MOVE.test(line) || LEG_CURL.test(line),
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
    // A second copy of the same weekday is the week pasted again. Keep the first session.
    if (existing) continue
    days.push({ weekday: marks[i].weekday, exercises })
  }
  return days.sort(
    (a, b) => WEEKDAYS.indexOf(a.weekday as (typeof WEEKDAYS)[number]) - WEEKDAYS.indexOf(b.weekday as (typeof WEEKDAYS)[number])
  )
}

function movementRegion(exercise: WorkingExercise): 'leg' | 'upper' | 'other' {
  if (CORE_MOVE.test(exercise.name) && !exercise.leg) return 'other'
  if (exercise.leg) return 'leg'
  if (exercise.arm || UPPER_MOVE.test(exercise.name)) return 'upper'
  return 'other'
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

  for (const day of next) {
    const legs = day.exercises.filter((exercise) => movementRegion(exercise) === 'leg')
    const upper = day.exercises.filter((exercise) => movementRegion(exercise) === 'upper')
    if (legs.length > 0 && upper.length > 0) {
      errors.push(
        `${day.weekday} mixes body parts (${upper[0]?.name} with ${legs[0]?.name}). One region per day: upper, lower, push, pull, or legs. Chest on a leg day is only an example. A core finisher may stay. Do not write a full-body day.`
      )
    }
    const unusual = day.exercises.filter((exercise) => !isCommonYouTubeExercise(exercise.name))
    if (unusual.length > 0) {
      const shown = unusual
        .slice(0, 3)
        .map((exercise) => exercise.label)
        .join(', ')
      errors.push(
        `${day.weekday} lists ${shown}, which is not a normal exercise people can search on YouTube. Use a common exercise such as Bench Press, Squat, Romanian Deadlift, Lat Pulldown, Row, Shoulder Press, or Push Up. Do not invent a move.`
      )
    }
    const seen = new Set<string>()
    for (const exercise of day.exercises) {
      if (seen.has(exercise.name)) {
        errors.push(`${day.weekday} lists ${exercise.name} twice. Each exercise once per day. Do not repeat it in the warm-up and the main work.`)
        break
      }
      seen.add(exercise.name)
    }
  }

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
