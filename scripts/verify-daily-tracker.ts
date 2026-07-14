import { buildTrackerSnapshot } from '../src/lib/daily-tracker/parser'
import { calculateTrackerScores } from '../src/lib/daily-tracker/scores'
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
  workoutItem?.type === 'workout' && workoutItem.dayLabel === 'Monday' && workoutItem.focus === 'Chest + Triceps'
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
const aiWorkout = aiSnap.items.find((i) => i.type === 'workout')
assert(
  'parses AI sets x reps format',
  aiWorkout?.type === 'workout' && aiWorkout.exercises.length >= 3
)
assert(
  'picks Day 2 for Tuesday',
  aiWorkout?.type === 'workout' &&
    (aiWorkout.dayLabel?.toLowerCase().includes('day 2') ||
      aiWorkout.focus?.toLowerCase().includes('squat') === true)
)
assert(
  'parses Barbell Back Squat from AI format',
  aiWorkout?.type === 'workout' &&
    aiWorkout.exercises.some((ex) => /squat/i.test(ex.name) && ex.targetSets === 5)
)

const planV2: Plan = { ...planV1, version: 2, nutrition_plan: 'Breakfast\nGreek yogurt and berries\n\nLunch\nTuna salad' }
const snapV2 = buildTrackerSnapshot(planV2)
assert('version 2 snapshot updates meals', snapV2.planVersion === 2)
assert('version 2 has updated breakfast', snapV2.items.some((i) => i.type === 'meal' && i.foods.includes('Greek yogurt')))

const { scores, overall } = calculateTrackerScores(snapV1, {
  meals: Object.fromEntries(
    snapV1.items
      .filter((i) => i.type === 'meal')
      .map((m) => [m.id, { completed: true }])
  ),
  water: { ml: 3000 },
})
assert('completion scoring works', scores.diet === 100 && overall > 0)

if (failed > 0) {
  console.error(`\n${failed} daily tracker checks failed`)
  process.exit(1)
}

console.log('\nAll daily tracker checks passed')
