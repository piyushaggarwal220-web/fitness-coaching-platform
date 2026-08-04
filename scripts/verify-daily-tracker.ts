import {
  buildTrackerSnapshot,
  mergeCompletion,
  planContentSignature,
  remapWorkoutDayKey,
  suggestedWorkoutDayKey,
} from '../src/lib/daily-tracker/parser'
import { calculateTrackerScores } from '../src/lib/daily-tracker/scores'
import { applyTrackerDraft } from '../src/lib/daily-tracker/tracker-draft'
import { formatPlanDayHeadersForClient } from '../src/lib/plan-day-labels'
import type { Plan } from '../src/types/database'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

const planV1: Plan = {
  id: 'plan-1',
  client_id: 'client-1',
  coach_id: 'coach-1',
  title: 'Week 2 Plan',
  phase: 'Fat loss',
  nutrition_plan: `Breakfast
Oats and eggs

Lunch
Chicken rice bowl

Dinner
Salmon and vegetables`,
  workout_plan: `Monday — Chest + Triceps
Warm-up
- Arm circles 2x15
- Push-up 2x10

Main Workout
- Bench press 4x8 @ 60 kg
- Incline press 3x10 @ 40 kg
- Row 3x10

Cool-down
- Chest stretch 2x30s`,
  cardio_plan: '8000 steps daily',
  supplement_plan: 'Creatine 5g morning\nVitamin D evening',
  coach_notes: 'Drink 3L water daily. Bed by 10:30 PM.',
  version: 1,
  active: true,
  delivered_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
}

const snapV1 = buildTrackerSnapshot(planV1)
assert('parses meals from diet', snapV1.items.some((i) => i.type === 'meal' && i.title === 'Breakfast'))
assert('parses workout exercises', snapV1.items.some((i) => i.type === 'workout' && 'exercises' in i && i.exercises.length > 0))
const workoutItem = snapV1.items.find((i) => i.type === 'workout')
assert(
  'parses workout phases',
  workoutItem?.type === 'workout' && workoutItem.phases.length >= 2
)
assert(
  'parses day label and focus',
  workoutItem?.type === 'workout' && workoutItem.dayLabel === 'Day 1' && workoutItem.focus === 'Chest + Triceps'
)
assert('parses cardio steps', snapV1.items.some((i) => i.type === 'cardio'))
assert('parses supplements', snapV1.items.some((i) => i.type === 'supplement'))
assert('includes water target', snapV1.items.some((i) => i.type === 'water'))
assert('includes sleep', snapV1.items.some((i) => i.type === 'sleep'))
assert('snapshot version matches plan', snapV1.planVersion === 1)

const multiDayDietPlan: Plan = {
  ...planV1,
  id: 'plan-diet-days',
  nutrition_plan: `Weekly Diet Plan

**MONDAY**

**Breakfast (7–8 am)**
3 whole eggs with 2 slices of bread
(P: 22g | C: 28g | F: 15g | ~330 kcal)

**Lunch (1–2 pm)**
Chicken rice bowl
(P: 38g | C: 58g | F: 10g | ~480 kcal)

**TUESDAY**

**Breakfast (7–8 am)**
2 rotis with scrambled eggs
(P: 28g | C: 38g | F: 12g | ~380 kcal)

**Dinner (8–9 pm)**
Grilled fish with sabzi
(P: 40g | C: 20g | F: 12g | ~350 kcal)
`,
}

const dietSnap = buildTrackerSnapshot(multiDayDietPlan)
const mondayMeals = dietSnap.items.filter((i) => i.type === 'meal' && i.dietDay === 'monday')
const tuesdayMeals = dietSnap.items.filter((i) => i.type === 'meal' && i.dietDay === 'tuesday')
assert('parses multi-day diet days list', (dietSnap.dietDays?.length ?? 0) >= 2)
assert('parses monday meals', mondayMeals.length >= 2)
assert('parses tuesday meals', tuesdayMeals.length >= 2)
assert(
  'labels diet days as Day N',
  dietSnap.dietDays?.some((d) => d.key === 'monday' && d.label === 'Day 1') === true &&
    dietSnap.dietDays?.some((d) => d.key === 'tuesday' && d.label === 'Day 2') === true
)
assert(
  'meal ids include day',
  mondayMeals.some((m) => m.type === 'meal' && m.id.includes('monday'))
)

const aiStylePlan: Plan = {
  ...planV1,
  id: 'plan-ai',
  workout_plan: `Intro paragraph about training.

**Day 1 — Upper Strength (Horizontal Push & Pull Focus)**
Barbell Bench Press: 5 sets x 5 reps (leave 1-2 reps in the tank)
Barbell Bent-Over Row: 4 sets x 6 reps (chest to bar)
Incline Dumbbell Press: 3 sets x 8 reps
Core: Weighted Cable Crunches 3 sets x 12 reps, Pallof Press (each side) 2 sets x 10 reps

**Day 2 — Lower Power (Squat Focus)**
Barbell Back Squat: 5 sets x 5 reps
Romanian Deadlift: 4 sets x 6 reps
Leg Press: 3 sets x 10 reps
`,
}

// Tuesday → Day 2 in Mon-first numbered plans
const tuesday = new Date('2026-07-14T12:00:00.000Z')
const aiSnap = buildTrackerSnapshot(aiStylePlan, null, tuesday)
const aiWorkouts = aiSnap.items.filter((i) => i.type === 'workout')
assert('parses all AI workout days', aiWorkouts.length >= 2)
assert('exposes workoutDays list', (aiSnap.workoutDays?.length ?? 0) >= 2)
const aiDay2 = aiWorkouts.find((i) => i.type === 'workout' && i.workoutDay === 'day-2')
assert(
  'parses AI sets x reps format',
  aiDay2?.type === 'workout' && aiDay2.exercises.length >= 3
)
assert(
  'includes Day 2 squat session',
  aiDay2?.type === 'workout' &&
    (aiDay2.dayLabel?.toLowerCase().includes('day 2') ||
      aiDay2.focus?.toLowerCase().includes('squat') === true)
)
assert(
  'parses Barbell Back Squat from AI format',
  aiDay2?.type === 'workout' &&
    aiDay2.exercises.some((ex) => /squat/i.test(ex.name) && ex.targetSets === 5)
)

const warmupPlan: Plan = {
  ...planV1,
  id: 'plan-warmup',
  workout_plan: `Before every session, spend about 10 minutes on this warmup: 2-3 minutes easy walking or light jogging on the treadmill, then move through 8-10 arm circles each direction, 10 bodyweight squats, 10 inchworms, 10 cat-cows, and 5 glute bridges.

**Day 2 — Lower Power**
Barbell Back Squat: 5 sets x 5 reps (rest 180s)
Romanian Deadlift: 4 sets x 6 reps

Post-workout: 30-60 seconds walk, then 10 hip flexor stretches each side, 10 chest openers.
`,
}

const warmupSnap = buildTrackerSnapshot(warmupPlan, null, tuesday)
const warmupWorkout = warmupSnap.items.find((i) => i.type === 'workout')
assert(
  'parses shared warm-up phase',
  warmupWorkout?.type === 'workout' &&
    warmupWorkout.phases.some((p) => p.phase === 'warmup' && p.exercises.length >= 3)
)
assert(
  'parses post-workout phase',
  warmupWorkout?.type === 'workout' &&
    warmupWorkout.phases.some((p) => p.phase === 'cooldown' && p.exercises.length >= 1)
)
assert(
  'parses explicit rest seconds',
  warmupWorkout?.type === 'workout' &&
    warmupWorkout.exercises.some((ex) => /squat/i.test(ex.name) && ex.restSeconds === 180)
)

const noWarmupPlan: Plan = {
  ...planV1,
  id: 'plan-no-warmup',
  workout_plan: `**Day 2 — Lower Power**
Barbell Back Squat: 5 sets x 5 reps
Romanian Deadlift: 4 sets x 6 reps
`,
}
const noWarmupSnap = buildTrackerSnapshot(noWarmupPlan, null, tuesday)
const noWarmupWorkout = noWarmupSnap.items.find((i) => i.type === 'workout')
assert(
  'always includes default warm-up when plan has none',
  noWarmupWorkout?.type === 'workout' &&
    noWarmupWorkout.phases.some((p) => p.phase === 'warmup' && p.exercises.length >= 3)
)

const planV2: Plan = { ...planV1, version: 2, nutrition_plan: 'Breakfast\nGreek yogurt and berries\n\nLunch\nTuna salad' }
const snapV2 = buildTrackerSnapshot(planV2)
assert('version 2 snapshot updates meals', snapV2.planVersion === 2)
assert('version 2 has updated breakfast', snapV2.items.some((i) => i.type === 'meal' && i.foods.includes('Greek yogurt')))
assert('snapshot stores plan content signature', Boolean(snapV1.planContentSignature))
assert(
  'plan content signature changes when diet changes',
  planContentSignature(planV1) !== planContentSignature(planV2)
)
assert(
  'snapshot signature matches helper',
  snapV2.planContentSignature === planContentSignature(planV2)
)

const { scores, overall } = calculateTrackerScores(snapV1, {
  meals: Object.fromEntries(
    snapV1.items
      .filter((i) => i.type === 'meal')
      .map((m) => [m.id, { completed: true }])
  ),
  water: { ml: 3000 },
})
assert('completion scoring works', scores.diet === 100 && overall > 0)

const mergedSession = mergeCompletion(
  { workoutSession: { status: 'in_progress', startedAt: '2026-07-30T10:00:00.000Z', durationSeconds: 120 } },
  { workoutSession: { status: 'in_progress', durationSeconds: 180, paused: true } }
)
assert(
  'mergeCompletion keeps in-progress workout session fields',
  mergedSession.workoutSession?.status === 'in_progress' &&
    mergedSession.workoutSession?.durationSeconds === 180 &&
    mergedSession.workoutSession?.paused === true &&
    mergedSession.workoutSession?.startedAt === '2026-07-30T10:00:00.000Z'
)

const draftMerged = applyTrackerDraft(
  { exercises: { ex1: { completed: false } } },
  {
    dayId: 'day-1',
    updatedAt: new Date().toISOString(),
    completion: { exercises: { ex1: { completed: true, sets: [{ completed: true }] } } },
  }
)
assert(
  'applyTrackerDraft restores unsynced exercise progress',
  draftMerged.exercises?.ex1?.completed === true
)

const weekdayPlan: Plan = {
  ...planV1,
  id: 'plan-weekdays',
  workout_plan: `Monday — Push
Main Workout
- Bench 4x8

Tuesday — Pull
Main Workout
- Row 4x8

Wednesday — Rest

Thursday — Legs
Main Workout
- Squat 4x5`,
}
const weekdaySnap = buildTrackerSnapshot(weekdayPlan)
const weekdayDays = weekdaySnap.workoutDays ?? []
assert('keeps rest day in workoutDays', weekdayDays.some((d) => d.key === 'wednesday'))
assert(
  'labels weekday workout days as Day N',
  weekdayDays.some((d) => d.key === 'monday' && d.label === 'Day 1') &&
    weekdayDays.some((d) => d.key === 'tuesday' && d.label === 'Day 2')
)
assert(
  'rest day has Rest focus',
  weekdaySnap.items.some(
    (i) => i.type === 'workout' && i.workoutDay === 'wednesday' && i.focus === 'Rest day'
  )
)

// Fixed IST Monday 2026-08-03 12:00 UTC = evening IST Monday
const istMonday = new Date('2026-08-03T06:30:00.000Z')
assert(
  'suggests monday for IST Monday on weekday plan',
  suggestedWorkoutDayKey(weekdayDays, istMonday) === 'monday'
)

const dayNPlan: Plan = {
  ...planV1,
  id: 'plan-day-n',
  workout_plan: `Day 1 — Push
Main Workout
- Bench 4x8

Day 2 — Pull
Main Workout
- Row 4x8

Day 3 — Legs
Main Workout
- Squat 4x5`,
}
const dayNDays = buildTrackerSnapshot(dayNPlan).workoutDays ?? []
assert(
  'does not invent Day N = weekday without coaching context',
  suggestedWorkoutDayKey(dayNDays, istMonday) === null
)
assert(
  'maps Day N via coaching day-in-week',
  suggestedWorkoutDayKey(dayNDays, istMonday, { coachingDayInWeek: 2 }) === 'day-2'
)
assert(
  'remaps day-1 selection onto monday key',
  remapWorkoutDayKey('day-1', [{ key: 'monday', label: 'Day 1' }]) === 'monday'
)
assert(
  'remaps monday selection onto day-1 key',
  remapWorkoutDayKey('monday', [{ key: 'day-1', label: 'Day 1' }]) === 'day-1'
)

assert(
  'formats plan prose weekday headers as Day N',
  formatPlanDayHeadersForClient('Monday — Push\nBench 4x8\n\nDay 2 (Wednesday) — Pull\nRow 4x8') ===
    'Day 1 — Push\nBench 4x8\n\nDay 2 — Pull\nRow 4x8'
)

// AI plan style forbids hyphens and writes "6 to 8" — must parse as training, not Rest.
const toRangePlan: Plan = {
  ...planV1,
  id: 'plan-to-ranges',
  workout_plan: `Day 1 — Lower Power
Barbell Back Squat: 4 sets x 6 to 8 reps
Romanian Deadlift: 3 sets x 8 to 10 reps
Leg Press: 3 sets of 10 to 12 reps

Day 2 — Upper Push
Bench Press: 4 sets x 6 to 8 reps
Overhead Press: 3 sets x 8 to 10 reps

Day 3 — Rest
`,
}
const toRangeSnap = buildTrackerSnapshot(toRangePlan, null, tuesday)
const toRangeDay1 = toRangeSnap.items.find(
  (i) => i.type === 'workout' && i.workoutDay === 'day-1'
)
const toRangeDay3 = toRangeSnap.items.find(
  (i) => i.type === 'workout' && i.workoutDay === 'day-3'
)
assert(
  'parses AI "N to M" rep ranges as real Lower Power session',
  toRangeDay1?.type === 'workout' &&
    toRangeDay1.focus !== 'Rest day' &&
    toRangeDay1.exercises.length >= 3 &&
    toRangeDay1.exercises.some((ex) => /squat/i.test(ex.name) && ex.targetReps === '6-8')
)
assert(
  'parses "sets of N to M" format',
  toRangeDay1?.type === 'workout' &&
    toRangeDay1.exercises.some((ex) => /leg press/i.test(ex.name) && ex.targetReps === '10-12')
)
assert(
  'still marks explicit Rest day as rest',
  toRangeDay3?.type === 'workout' && toRangeDay3.focus === 'Rest day'
)
assert(
  'does not mark Upper Push as rest when using to-ranges',
  toRangeSnap.items.some(
    (i) =>
      i.type === 'workout' &&
      i.workoutDay === 'day-2' &&
      i.focus !== 'Rest day' &&
      i.exercises.length >= 2
  )
)

if (failed > 0) {
  console.error(`\n${failed} daily tracker checks failed`)
  process.exit(1)
}

console.log('\nAll daily tracker checks passed')
