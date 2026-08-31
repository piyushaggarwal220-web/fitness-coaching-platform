import {
  clientRequestNeedsExpenditureFocus,
  clientRequestTouchesCalories,
  estimateMaintenanceCalories,
  calorieTargetBand,
} from '../src/lib/ai/calorie-targets'
import { resolveDietFloorKcal } from '../src/lib/ai/plan-quality-rules'
import {
  stabilizeDietCaloriesAfterEdit,
  parseHeaderCalories,
  syncStoredDietText,
  dietTextHasCalorieConflict,
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
assert(
  'plateau does not count as explicit calorie request',
  clientRequestTouchesCalories('I am not losing weight anymore') === false
)
assert(
  'detects plateau expenditure focus',
  clientRequestNeedsExpenditureFocus('I am not losing weight anymore') === true
)

const maintenance = estimateMaintenanceCalories({
  weightKg: 70,
  heightCm: 170,
  age: 28,
  gender: 'male',
  activityLevel: 'moderately_active',
})
assert('maintenance estimate is realistic', Boolean(maintenance && maintenance >= 2000 && maintenance <= 3200))

const highFluxBand = calorieTargetBand(maintenance ?? 2200, 'fat_loss', 'high_flux', resolveDietFloorKcal(70))
const legacyBand = calorieTargetBand(maintenance ?? 2200, 'fat_loss', 'steady', resolveDietFloorKcal(70))
assert('high flux fat loss band stays above floor', highFluxBand.min >= 1900)
assert('high flux preferred is in upper half of band', highFluxBand.preferred >= highFluxBand.min + (highFluxBand.max - highFluxBand.min) * 0.5)
assert('high flux band is shallower than steady', highFluxBand.min > legacyBand.min)
assert('high flux band caps deficit', highFluxBand.max <= (maintenance ?? 2200))

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

const headerMealMismatch = `Calories: 1806
Protein: 109g
Carbs: 237g
Fat: 57g

Weekly Diet Plan: giving you about 1806 calories per day.
Day 1 (Monday)
Breakfast
(P: 24g | C: 54g | F: 18g | ~480 kcal)
(P: 8g | C: 32g | F: 14g | ~280 kcal)
(P: 22g | C: 72g | F: 16g | ~520 kcal)
(P: 10g | C: 24g | F: 4g | ~170 kcal)
(P: 48g | C: 56g | F: 10g | ~500 kcal)
(P: 7g | C: 10g | F: 8g | ~130 kcal)
Daily Total: P: 119g | C: 248g | F: 70g | ~2080 kcal
Day 2 (Tuesday)
Daily Total: P: 104g | C: 252g | F: 67g | ~2010 kcal
Weekly Summary
Daily averages across the 7 days: about 1980 kcal | P: 109g | C: 250g | F: 65g`

assert('detects header vs food conflict', dietTextHasCalorieConflict(headerMealMismatch))
const syncedMismatch = syncStoredDietText(headerMealMismatch, {
  previousCalories: 1806,
  preserveCalories: true,
})
assert(
  'syncs header to food totals even when preserveCalories (AI bumped portions)',
  parseHeaderCalories(syncedMismatch) === 2023
)
assert(
  'rewrites stale 1806 prose after sync',
  !/about 1806 calories/i.test(syncedMismatch)
)

if (failed > 0) {
  console.error(`\n${failed} calorie target checks failed`)
  process.exit(1)
}
console.log('\nAll calorie target checks passed')
