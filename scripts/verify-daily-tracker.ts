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
  workout_plan: `Monday
- Bench press 4x8 @ 60 kg
- Row 3x10`,
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
assert(
  'parses workout exercises',
  snapV1.items.some((i) => i.type === 'workout' && 'exercises' in i && i.exercises.length > 0)
)
assert('parses cardio steps', snapV1.items.some((i) => i.type === 'cardio'))
assert('parses supplements', snapV1.items.some((i) => i.type === 'supplement'))
assert('includes water target', snapV1.items.some((i) => i.type === 'water'))
assert('includes sleep', snapV1.items.some((i) => i.type === 'sleep'))
assert('snapshot version matches plan', snapV1.planVersion === 1)

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
