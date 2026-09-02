import {
  buildTrackerSnapshot,
  dropSelectedDaysForPlanChange,
  mergeCompletion,
  planContentSignature,
  remapWorkoutDayKey,
  suggestedWorkoutDayKey,
} from '../src/lib/daily-tracker/parser'
import { getCurrentExercise } from '../src/lib/daily-tracker/exercise-utils'
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
  workoutItem?.type === 'workout' &&
    workoutItem.dayLabel === 'Day 1 (Monday)' &&
    workoutItem.focus === 'Chest + Triceps'
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
  'labels diet days as Day N (Weekday)',
  dietSnap.dietDays?.some((d) => d.key === 'monday' && d.label === 'Day 1 (Monday)') === true &&
    dietSnap.dietDays?.some((d) => d.key === 'tuesday' && d.label === 'Day 2 (Tuesday)') === true
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
assert(
  'plan change drops frozen diet/workout day picks',
  dropSelectedDaysForPlanChange({
    selectedDietDay: 'monday',
    selectedWorkoutDay: 'tuesday',
    meals: { 'meal-monday-breakfast': { completed: true } },
  }).selectedDietDay == null &&
    dropSelectedDaysForPlanChange({
      selectedDietDay: 'monday',
      selectedWorkoutDay: 'tuesday',
      meals: { 'meal-monday-breakfast': { completed: true } },
    }).selectedWorkoutDay == null
)
assert(
  'plan change keeps meal checkmarks',
  Boolean(
    dropSelectedDaysForPlanChange({
      selectedDietDay: 'monday',
      meals: { 'meal-monday-breakfast': { completed: true } },
    }).meals?.['meal-monday-breakfast']?.completed
  )
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
  'labels weekday workout days as Day N (Weekday)',
  weekdayDays.some((d) => d.key === 'monday' && d.label === 'Day 1 (Monday)') &&
    weekdayDays.some((d) => d.key === 'tuesday' && d.label === 'Day 2 (Tuesday)')
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
  'Day 1 plan infers Monday so today (Monday) maps to day-1',
  suggestedWorkoutDayKey(dayNDays, istMonday) === 'day-1'
)
assert(
  'maps bare Day N labels via coaching day-in-week',
  suggestedWorkoutDayKey(
    [
      { key: 'day-1', label: 'Day 1 (Monday)', calendarAligned: false },
      { key: 'day-2', label: 'Day 2 (Tuesday)', calendarAligned: false },
    ],
    istMonday,
    { coachingDayInWeek: 2 }
  ) === 'day-2'
)
assert(
  'rolling Day N plan uses coaching day not IST calendar on start mid-week',
  suggestedWorkoutDayKey(
    [
      { key: 'day-1', label: 'Day 1 (Monday)', calendarAligned: false },
      { key: 'day-2', label: 'Day 2 (Tuesday)', calendarAligned: false },
      { key: 'day-3', label: 'Day 3 (Wednesday)', calendarAligned: false },
    ],
    new Date('2026-08-06T06:30:00.000Z'),
    { coachingDayInWeek: 1 }
  ) === 'day-1'
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
  'formats plan prose headers with weekdays',
  formatPlanDayHeadersForClient('Monday — Push\nBench 4x8\n\nDay 2 (Wednesday) — Pull\nRow 4x8\n\nDay 3 — Rest') ===
    'Day 1 (Monday) — Push\nBench 4x8\n\nDay 2 (Wednesday) — Pull\nRow 4x8\n\nDay 3 (Wednesday) — Rest'
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

// Weekday headers + per-day Post-Workout must NOT pull Tuesday's lifts into Monday cooldown.
const weekdayPostWorkoutPlan: Plan = {
  ...planV1,
  id: 'plan-weekday-post-workout',
  workout_plan: `Monday — Lower Strength
Warm-up
- Bodyweight squat 2x10

Main Workout
- Barbell Back Squat: 4 sets x 6 reps
- Romanian Deadlift: 3 sets x 8 reps

Post-Workout
- Hip Flexor Stretch: 2x30s
- Couch Stretch: 2x30s each side

Tuesday — Upper Push
Warm-up
- Arm circles 2x15

Main Workout
- Barbell Bench Press: 4 sets x 6 reps
- Overhead Press: 3 sets x 8 reps

Post-Workout
- Chest Opener: 2x30s
- Doorway Stretch: 2x30s
`,
}
const postWorkoutSnap = buildTrackerSnapshot(weekdayPostWorkoutPlan)
const mondayWorkout = postWorkoutSnap.items.find(
  (i) => i.type === 'workout' && (i.workoutDay === 'monday' || i.dayLabel === 'Monday')
)
const tuesdayWorkout = postWorkoutSnap.items.find(
  (i) => i.type === 'workout' && (i.workoutDay === 'tuesday' || i.dayLabel === 'Tuesday')
)
assert(
  'weekday plan parses Monday and Tuesday workouts',
  mondayWorkout?.type === 'workout' && tuesdayWorkout?.type === 'workout'
)
const mondayCooldown =
  mondayWorkout?.type === 'workout'
    ? mondayWorkout.phases.find((p) => p.phase === 'cooldown')?.exercises ?? []
    : []
assert(
  'Monday Post-Workout keeps stretches only',
  mondayCooldown.some((ex) => /hip flexor|couch stretch/i.test(ex.name)) &&
    !mondayCooldown.some((ex) => /bench|overhead press/i.test(ex.name))
)
assert(
  'Monday Post-Workout does not include shared next-day compounds',
  !mondayCooldown.some((ex) => /shared/i.test(ex.id) && /bench|press|squat/i.test(ex.name))
)
assert(
  'Tuesday Post-Workout keeps its own stretches',
  tuesdayWorkout?.type === 'workout' &&
    (tuesdayWorkout.phases.find((p) => p.phase === 'cooldown')?.exercises ?? []).some((ex) =>
      /chest opener|doorway/i.test(ex.name)
    )
)

if (mondayWorkout?.type === 'workout') {
  const completion: Record<string, { completed: boolean }> = {}
  for (const ex of mondayWorkout.exercises) {
    if (ex.phase !== 'cooldown') completion[ex.id] = { completed: true }
  }
  const current = getCurrentExercise(mondayWorkout.exercises, completion)
  assert(
    'after Monday main work, current exercise is a stretch (not Tuesday lift)',
    Boolean(current && /stretch|opener/i.test(current.name) && current.phase === 'cooldown')
  )
  assert(
    'after Monday main work, current is not a next-day compound',
    Boolean(current && !/bench|overhead press/i.test(current.name))
  )
}

{
  const weekdayHeaderPlan: Plan = {
    ...planV1,
    workout_plan: `Day 4 (Thursday): Lower Hypertrophy and Core Density
Lower
Goblet Squat: 4 sets x 10
Romanian Deadlift: 3 sets x 8
Core endurance for the full race effort
Hanging Knee Raise: 3 sets x 12`,
  }
  const snap = buildTrackerSnapshot(weekdayHeaderPlan)
  const workout = snap.items.find((i) => i.type === 'workout')
  const names = workout?.type === 'workout' ? workout.exercises.map((ex) => ex.name) : []
  assert(
    'Day N (Weekday) header is not stored as an exercise name',
    !names.some((name) => /day 4|thursday|lower hypertrophy/i.test(name))
  )
  assert(
    'muscle-group-only line Lower is not an exercise',
    !names.some((name) => /^lower$/i.test(name.trim()))
  )
  assert(
    'purpose sentence is not used as the exercise name',
    !names.some((name) => /core endurance for the full race/i.test(name))
  )
  assert(
    'real lifts still parse under Day N (Weekday) headers',
    names.some((name) => /goblet squat/i.test(name)) && names.some((name) => /hanging knee raise/i.test(name))
  )
}

{
  const coachingCuePlan: Plan = {
    ...planV1,
    workout_plan: `Day 1 (Monday): Lower Power
Goblet Squat: 3 sets x 8
Focus on the squat and RDL today — these are your strength anchors. Keep the tempo controlled on the way down (2-3s). Rest 20 seconds
Romanian Deadlift: 3 sets x 8
Plank: 45 seconds`,
  }
  const coachingNames = (buildTrackerSnapshot(coachingCuePlan).items.find((i) => i.type === 'workout') as
    | { exercises: { name: string }[] }
    | undefined)?.exercises.map((ex) => ex.name) ?? []
  assert(
    'coaching tempo sentence is not stored as an exercise',
    !coachingNames.some((name) => /focus on the squat|strength anchors|tempo controlled/i.test(name))
  )
  assert(
    'real lifts still parse next to coaching prose',
    coachingNames.some((name) => /goblet squat/i.test(name)) &&
      coachingNames.some((name) => /romanian deadlift/i.test(name)) &&
      coachingNames.some((name) => /^plank$/i.test(name))
  )
}

{
  const leakedSectionsPlan: Plan = {
    ...planV1,
    id: 'plan-leaked-sections',
    workout_plan: `Day 1 (Monday): Lower Power
Warm-up:
- Arm circles 2x15
- Bodyweight squat 2x10
- Goblet Squat: 3 sets x 8 reps

Main Workout:
- Romanian Deadlift: 3 sets x 8 reps

Post-Workout:
- Tricep Rope Pushdown: 3 sets x 12 reps
- Hip Flexor Stretch: 2x30s
`,
  }
  const leakedSnap = buildTrackerSnapshot(leakedSectionsPlan)
  const leakedWorkout = leakedSnap.items.find((i) => i.type === 'workout')
  const leakedWarm =
    leakedWorkout?.type === 'workout'
      ? leakedWorkout.phases.find((p) => p.phase === 'warmup')?.exercises ?? []
      : []
  const leakedMain =
    leakedWorkout?.type === 'workout'
      ? leakedWorkout.phases.find((p) => p.phase === 'main')?.exercises ?? []
      : []
  const leakedCool =
    leakedWorkout?.type === 'workout'
      ? leakedWorkout.phases.find((p) => p.phase === 'cooldown')?.exercises ?? []
      : []
  assert(
    'working squat in Warm-up is rehomed to Main Workout',
    leakedMain.some((ex) => /goblet squat/i.test(ex.name)) &&
      !leakedWarm.some((ex) => /goblet squat/i.test(ex.name))
  )
  assert(
    'light bodyweight squat stays in Warm-up',
    leakedWarm.some((ex) => /bodyweight squat/i.test(ex.name))
  )
  assert(
    'pushdown in Post-Workout is rehomed to Main Workout',
    leakedMain.some((ex) => /pushdown/i.test(ex.name)) &&
      !leakedCool.some((ex) => /pushdown/i.test(ex.name))
  )
  assert(
    'stretches stay in Post-Workout',
    leakedCool.some((ex) => /hip flexor/i.test(ex.name))
  )
  assert(
    'RDL stays in Main Workout',
    leakedMain.some((ex) => /romanian deadlift/i.test(ex.name))
  )
}

{
  const walkingPlan: Plan = {
    ...planV1,
    workout_plan: `Day 1 (Monday) — Lower
Warm-up
Walking: 3 sets x 15 min

Main Workout
Barbell Back Squat: 4 sets x 6 reps`,
  }
  const walkingSnap = buildTrackerSnapshot(walkingPlan)
  const walkingWorkout = walkingSnap.items.find((i) => i.type === 'workout')
  const walkingEx =
    walkingWorkout?.type === 'workout'
      ? walkingWorkout.exercises.find((ex) => /walk/i.test(ex.name))
      : undefined
  assert('walking is a single timed session not multi-set strength', walkingEx?.targetSets === 1)
  assert('walking duration preserved', walkingEx?.targetReps === '15 min')
}

{
  const macroPlan: Plan = {
    ...planV1,
    nutrition_plan: `Day 1 (Monday)
Breakfast
Oats and eggs (P: 28g | C: 45g | F: 12g | ~420 kcal)

Lunch
Chicken rice (P: 40g | C: 55g | F: 10g | ~520 kcal)`,
  }
  const macroSnap = buildTrackerSnapshot(macroPlan)
  const breakfast = macroSnap.items.find(
    (i) => i.type === 'meal' && i.title === 'Breakfast'
  )
  assert(
    'parses parenthetical meal macro line',
    breakfast?.type === 'meal' &&
      breakfast.macros?.calories === 420 &&
      breakfast.macros?.protein === 28
  )
}

{
  const nightShiftPlan: Plan = {
    ...planV1,
    nutrition_plan: `Day 1 (Monday)

Post shift breakfast (around 7am, after you finish work):
2 parathas with curd and chai.

Pre shift dinner (around 8pm, before you head to the hospital):
Rice, dal tadka, and sabzi.

Mid shift snack (around 2am at the canteen):
2 bananas and biscuits.

Evening snack (calorie fill): 2 rotis, dal, banana.
Daily Total: P: 66g | C: 288g | F: 66g | ~2390 kcal`,
  }
  const nightSnap = buildTrackerSnapshot(nightShiftPlan)
  const nightMeals = nightSnap.items.filter((i) => i.type === 'meal')
  const titles = nightMeals.map((i) => (i.type === 'meal' ? i.title : '')).join(', ')
  assert(
    'parses Post shift breakfast',
    nightMeals.some((i) => i.type === 'meal' && /breakfast/i.test(i.title) && /paratha/i.test(i.foods))
  )
  assert(
    'parses Pre shift dinner',
    nightMeals.some((i) => i.type === 'meal' && /dinner/i.test(i.title) && /dal/i.test(i.foods))
  )
  assert(
    'parses Mid shift snack',
    nightMeals.some((i) => i.type === 'meal' && /snack/i.test(i.title) && /banana/i.test(i.foods))
  )
  assert(`night-shift day has 3+ tracker meals (${titles})`, nightMeals.length >= 3)
}

if (failed > 0) {
  console.error(`\n${failed} daily tracker checks failed`)
  process.exit(1)
}

console.log('\nAll daily tracker checks passed')
