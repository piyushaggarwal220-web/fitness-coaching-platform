import {
  estimateMaintenanceCalories,
  calorieTargetBand,
  formatCalorieGuidanceBlock,
  resolveClientCalorieTargets,
  resolveEffectiveActivityLevel,
  clientRequestTouchesCalories,
  clientRequestNeedsExpenditureFocus,
} from '../src/lib/ai/calorie-targets'
import { resolveDietFloorKcal } from '../src/lib/ai/plan-quality-rules'
import {
  stabilizeDietCaloriesAfterEdit,
  parseHeaderCalories,
  syncStoredDietText,
  dietTextHasCalorieConflict,
  enforceDietSafety,
  getAuthoritativeNutritionCalories,
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
assert('high flux fat loss band stays above floor', highFluxBand.min >= 2000)
assert('high flux fat loss target is maintenance minus shallow deficit', highFluxBand.preferred === (maintenance ?? 2200) - 125)
assert('high flux target sits inside band', highFluxBand.preferred >= highFluxBand.min && highFluxBand.preferred <= highFluxBand.max)
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
  parseHeaderCalories(crashCut) === 2000
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

const lowFoodHighHeader = `Calories: 1800
Protein: 55g
Carbs: 235g
Fat: 42g

Weekly Diet Plan: about 1800 calories per day.
Day 1 (Monday)
Breakfast: oats
(P: 12g | C: 48g | F: 10g | ~310 kcal)
Mid morning snack: apple
(P: 4g | C: 28g | F: 9g | ~180 kcal)
Lunch: roti dal
(P: 18g | C: 62g | F: 10g | ~420 kcal)
Evening snack: curd
(P: 8g | C: 32g | F: 4g | ~180 kcal)
Dinner: roti chana
(P: 16g | C: 58g | F: 11g | ~400 kcal)
Daily Total: P: 58g | C: 228g | F: 44g | ~1490 kcal
Day 2 (Tuesday)
Daily Total: P: 53g | C: 244g | F: 41g | ~1540 kcal
Weekly Summary
Daily averages: ~1515 kcal | P: 55g | C: 235g | F: 42g`

assert('detects 1800 header vs ~1515 food', dietTextHasCalorieConflict(lowFoodHighHeader))
const syncedLowFood = syncStoredDietText(lowFoodHighHeader)
assert(
  'sync pulls header down to food math (not fake 1800/1900)',
  parseHeaderCalories(syncedLowFood) === 1515
)
assert(
  'enforce rejects meal math below floor',
  enforceDietSafety(
    {
      calories: 1800,
      protein: 55,
      carbs: 235,
      fat: 42,
      meals: [{ example: lowFoodHighHeader.split('\n').slice(4).join('\n') }],
    },
    { floorKcal: 1900 }
  ).ok === false
)
assert(
  'enforce rejects plans far below the Mifflin preferred target',
  enforceDietSafety(
    {
      calories: 2118,
      protein: 120,
      carbs: 220,
      fat: 65,
      meals: [],
    },
    { floorKcal: 2000, preferredMinKcal: 3331 }
  ).ok === false
)
assert(
  'enforce allows a plan within 100 kcal of the Mifflin target',
  enforceDietSafety(
    {
      calories: 2320,
      protein: 120,
      carbs: 220,
      fat: 65,
      meals: [],
    },
    { floorKcal: 2000, preferredMinKcal: 2375 }
  ).ok === true
)

const veganFloorHint = enforceDietSafety(
  {
    calories: 1800,
    protein: 55,
    carbs: 235,
    fat: 42,
    meals: [{ example: lowFoodHighHeader.split('\n').slice(4).join('\n') }],
  },
  {
    floorKcal: 1900,
    calorieBumpFoods: 'roti, rice, dal, soya, peanuts, snacks, and cooking oil (never ghee, butter, paneer, curd, dairy, or whey)',
  }
)
assert('vegan calorie retry hint is a failure', veganFloorHint.ok === false)
if (!veganFloorHint.ok) {
  assert('vegan calorie retry does not tell the model to add oil/ghee', !/oil\/ghee/i.test(veganFloorHint.hint))
  assert('vegan calorie retry names soya and oil', /soya/i.test(veganFloorHint.hint) && /cooking oil/i.test(veganFloorHint.hint))
}

const sixDayProfile = {
  weight: 72,
  height: 175,
  age: 24,
  gender: 'male',
  activity_level: 'moderately_active',
  fitness_goal: 'recomposition',
  onboarding_data: { training: { daysPerWeek: 6 } },
} as const
assert(
  '6-day training bumps activity for maintenance',
  resolveEffectiveActivityLevel(sixDayProfile) === 'very_active'
)
const sixDayTargets = resolveClientCalorieTargets(sixDayProfile)
assert(
  '6-day lifter gets maintenance above 2400 kcal',
  Boolean(sixDayTargets && sixDayTargets.maintenance >= 2400)
)
assert(
  '6-day recomp target equals maintenance (real number)',
  Boolean(sixDayTargets && sixDayTargets.preferred === sixDayTargets.maintenance)
)

const officeMale = resolveClientCalorieTargets({
  weight: 78,
  height: 175,
  age: 32,
  gender: 'male',
  activity_level: 'sedentary',
  fitness_goal: 'fat_loss',
  onboarding_data: { training: { daysPerWeek: 3 } },
})
assert(
  'desk-job male fat loss is still ~2000+ (not 1500)',
  Boolean(officeMale && officeMale.preferred >= 2000)
)

const smallFemale = resolveClientCalorieTargets({
  weight: 58,
  height: 158,
  age: 26,
  gender: 'female',
  activity_level: 'sedentary',
  fitness_goal: 'fat_loss',
})
assert(
  'smaller sedentary female is floored to 2000, not 1400',
  Boolean(smallFemale && smallFemale.preferred >= 2000 && smallFemale.floorKcal >= 2000)
)

const heavyMale = resolveClientCalorieTargets({
  weight: 86,
  height: 176,
  age: 34,
  gender: 'male',
  activity_level: 'sedentary',
  fitness_goal: 'fat_loss',
})
assert(
  '86kg client uses weight floor (~2150) not a 1800 template',
  Boolean(heavyMale && heavyMale.preferred >= 2150)
)

const guidance = formatCalorieGuidanceBlock({
  weight: 78,
  height: 175,
  age: 32,
  gender: 'male',
  activity_level: 'moderately_active',
  fitness_goal: 'fat_loss',
})
assert('guidance names the hard target', Boolean(guidance && /WRITE THIS NUMBER/i.test(guidance)))
assert('guidance forbids crash-diet templates', Boolean(guidance && /FORBIDDEN: 1400/i.test(guidance)))
assert('guidance includes a 4-digit kcal target', Boolean(guidance && /\b2\d{3} kcal/.test(guidance)))

if (failed > 0) {
  console.error(`\n${failed} calorie target checks failed`)
  process.exit(1)
}
console.log('\nAll calorie target checks passed')
