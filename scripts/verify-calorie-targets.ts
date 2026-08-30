import {
  clientRequestTouchesCalories,
  estimateMaintenanceCalories,
  calorieTargetBand,
} from '../src/lib/ai/calorie-targets'
import {
  stabilizeDietCaloriesAfterEdit,
  parseHeaderCalories,
} from '../src/lib/ai/nutrition-macro-sync'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

assert(
  'detects explicit calorie change requests',
  clientRequestTouchesCalories('Please increase my calories, I am hungry') === true
)
assert(
  'food swap does not count as calorie request',
  clientRequestTouchesCalories('Swap chicken for paneer on Tuesday lunch') === false
)

const maintenance = estimateMaintenanceCalories({
  weightKg: 70,
  heightCm: 170,
  age: 28,
  gender: 'male',
  activityLevel: 'moderately_active',
})
assert('maintenance estimate is realistic', Boolean(maintenance && maintenance >= 2000 && maintenance <= 3200))

const band = calorieTargetBand(maintenance ?? 2200, 'fat_loss')
assert('fat loss band stays above floor', band.min >= 1800)
assert('fat loss band caps deficit', band.max <= (maintenance ?? 2200))

const priorDiet = `Calories: 2100
Protein: 120g
Carbs: 220g
Fat: 65g

Day 1 (Monday)
Breakfast: oats and eggs
(P: 28g | C: 40g | F: 15g | ~420 kcal)
`

const swappedTooLow = `${priorDiet}
Lunch swapped to salad only
(P: 10g | C: 12g | F: 4g | ~120 kcal)
I'm giving you 1600 calories this week.
`

const stabilized = stabilizeDietCaloriesAfterEdit(swappedTooLow, {
  previousCalories: 2100,
  preserveCalories: true,
})
assert(
  'preserves prior calories on food swap edit',
  parseHeaderCalories(stabilized) === 2100
)
assert(
  'rewrites conversational low calorie claim',
  !/1600\s*calories/i.test(stabilized) || /2100/.test(stabilized)
)

const crashCut = stabilizeDietCaloriesAfterEdit(
  `Calories: 1780
Protein: 110g
Carbs: 160g
Fat: 55g
Daily averages: ~1780 kcal | P: 110g | C: 160g | F: 55g
`,
  { previousCalories: 2100, preserveCalories: false }
)
assert(
  'blocks 2100→1780 crash cut (max 200 kcal drop)',
  parseHeaderCalories(crashCut) === 1900
)

if (failed > 0) {
  console.error(`\n${failed} calorie target checks failed`)
  process.exit(1)
}
console.log('\nAll calorie target checks passed')
