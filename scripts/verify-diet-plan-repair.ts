/**
 * Offline checks for deterministic diet repair (the 25% → 95% path).
 * Run: npx tsx scripts/verify-diet-plan-repair.ts
 */
import {
  applyDietPlanRepair,
  dietPlanMeetsContract,
} from '../src/lib/ai/diet-plan-repair'
import { enforceDietPreference, dietScanOptionsFromProfile } from '../src/lib/ai/diet-preference-guard'
import { resolveClientCalorieTargets } from '../src/lib/ai/calorie-targets'
import {
  enforceDietSafety,
  getAuthoritativeNutritionCalories,
  parseHeaderCalories,
  reconcileDietProseCalories,
} from '../src/lib/ai/nutrition-macro-sync'
import type { GeneratedNutritionPlan } from '../src/lib/ai/generate-plan'

let failed = 0

function assert(label: string, ok: boolean, detail?: string) {
  if (!ok) {
    failed++
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    console.log(`PASS ${label}`)
  }
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function weekPlan(kcal: number, meal: (day: string) => string): GeneratedNutritionPlan {
  const perMeal = Math.round(kcal / 3)
  const example = DAYS.map((day, i) => {
    const food = meal(day)
    return `Day ${i + 1} (${day})
Breakfast: ${food}
(P: 15g | C: 40g | F: 10g | ~${perMeal} kcal)
Lunch: ${food}
(P: 20g | C: 50g | F: 12g | ~${perMeal} kcal)
Dinner: ${food}
(P: 18g | C: 45g | F: 10g | ~${perMeal} kcal)
Daily Total: ~${kcal} kcal | P: 53g | C: 135g | F: 32g`
  }).join('\n\n')
  return { calories: kcal, protein: 53, carbs: 135, fat: 32, meals: [{ example }] }
}

function prose(plan: GeneratedNutritionPlan): string {
  const meal = plan.meals[0]
  if (typeof meal === 'string') return meal
  if (meal && typeof meal === 'object' && 'example' in meal) {
    return String((meal as { example: string }).example)
  }
  return ''
}

const adultMale = {
  diet_preference: 'vegetarian',
  weight: '76',
  height: '172',
  age: '29',
  gender: 'male',
  activity_level: 'moderately_active',
  fitness_goal: 'fat_loss',
}

const veganSouth = {
  diet_preference: 'vegan',
  weight: '62',
  height: '160',
  age: '29',
  gender: 'female',
  activity_level: 'lightly_active',
  fitness_goal: 'fat_loss',
}

const veganDirty = weekPlan(
  1600,
  () => '2 rotis with paneer bhurji, 1 tsp ghee, curd, and 1 tbsp peanut butter'
)
const veganRepaired = applyDietPlanRepair(veganDirty, veganSouth)
const veganText = prose(veganRepaired.plan)
assert('vegan ghee removed', !/\bghee\b/i.test(veganText))
assert('vegan butter (dairy) removed', !/\bbutter\b/i.test(veganText.replace(/\bpeanut butter\b/gi, 'nutbutter')))
assert('vegan paneer removed', !/\bpaneer\b/i.test(veganText))
assert('vegan peanut butter kept', /peanut butter/i.test(veganText))
assert('vegan contract met', dietPlanMeetsContract(veganRepaired.plan, veganSouth))

const wheyDirty = weekPlan(2100, () => 'dal roti and 1 scoop whey protein with water')
const wheyProfile = {
  ...adultMale,
  onboarding_data: { diet: { wheyProtein: 'no', allergies: 'none' } },
}
const wheyRepaired = applyDietPlanRepair(wheyDirty, wheyProfile)
assert('whey stripped when client said no', !/\bwhey\b/i.test(prose(wheyRepaired.plan)))
assert(
  'whey-no contract met',
  dietPlanMeetsContract(wheyRepaired.plan, wheyProfile)
)

const sundayEggs = weekPlan(2200, (day) =>
  day === 'Sunday' ? '3 eggs omelette with roti' : day === 'Monday' ? 'egg bhurji with roti' : 'poha with peanuts'
)
const eggProfile = {
  diet_preference: 'eggetarian',
  weight: '72',
  height: '178',
  age: '26',
  gender: 'male',
  activity_level: 'moderately_active',
  fitness_goal: 'muscle_gain',
  onboarding_data: {
    diet: {
      eggAllowedDays: ['monday', 'wednesday', 'friday'],
      eggDaysPerWeek: '3',
      chickenDaysPerWeek: '0',
      fishDaysPerWeek: '0',
      wheyProtein: 'yes',
    },
  },
}
const eggRepaired = applyDietPlanRepair(sundayEggs, eggProfile)
const eggText = prose(eggRepaired.plan)
const sundayBlock = eggText.slice(eggText.toLowerCase().indexOf('day 7 (sunday)'))
const mondayBlock = eggText.slice(
  eggText.toLowerCase().indexOf('day 1 (monday)'),
  eggText.toLowerCase().indexOf('day 2 (tuesday)')
)
assert('Sunday eggs swapped off', !/\begg/i.test(sundayBlock))
assert('Monday eggs kept', /\begg/i.test(mondayBlock))
const eggPref = enforceDietPreference(
  eggRepaired.plan,
  'eggetarian',
  dietScanOptionsFromProfile(eggProfile)
)
assert('weekday egg contract met', eggPref.ok, eggPref.ok ? undefined : eggPref.error)

const lowCal = weekPlan(1600, () => 'dal, roti, sabzi')
const calRepaired = applyDietPlanRepair(lowCal, adultMale)
const targets = resolveClientCalorieTargets(adultMale)
const got = getAuthoritativeNutritionCalories(calRepaired.plan)
assert(
  `1600 plan raised toward Mifflin (~${targets?.preferred})`,
  got >= (targets?.preferred ?? 2000) - 100,
  `got ${got}`
)
assert(
  '1600 plan is not stuffed far above Mifflin',
  got <= (targets?.preferred ?? 2000) + 150,
  `got ${got} vs ${targets?.preferred}`
)
const nearTarget = weekPlan(targets?.preferred ?? 2400, () => 'dal, roti, sabzi')
const nearRepaired = applyDietPlanRepair(nearTarget, adultMale)
const nearGot = getAuthoritativeNutritionCalories(nearRepaired.plan)
assert(
  'already-on-target plan stays near Mifflin',
  Math.abs(nearGot - (targets?.preferred ?? 2400)) <= 120,
  `got ${nearGot} vs ${targets?.preferred}`
)
const safety = enforceDietSafety(calRepaired.plan, {
  floorKcal: targets?.floorKcal,
  preferredMinKcal: targets?.preferred,
  maintenanceKcal: targets?.maintenance,
})
assert('repaired low-cal plan passes calorie safety', safety.ok, safety.ok ? undefined : safety.error)
const calText = prose(calRepaired.plan)
assert('repaired plan never shows (calorie fill)', !/\(calorie fill\)/i.test(calText))
assert(
  'repaired plan does not dump three identical top-up snacks',
  (calText.match(/\(calorie fill\)/gi) ?? []).length === 0 &&
    (calText.match(/Late snack:/gi) ?? []).length === 0
)
const calHeader = parseHeaderCalories(calText)
if (calHeader != null) {
  assert(
    'header calories match food totals after repair',
    Math.abs(calHeader - got) <= 40,
    `header ${calHeader} vs food ${got}`
  )
}

const mismatchedIntro = reconcileDietProseCalories(
  'Calories: 2350\nWeekly Diet Plan: Hey Rishabh, we are working with about **3310** calories daily to support fat loss.',
  2350
)
assert(
  'intro calorie claim is rewritten to match the header',
  /2350/.test(mismatchedIntro) && !/3310/.test(mismatchedIntro),
  mismatchedIntro.slice(0, 160)
)

const chickenWeek = weekPlan(1800, (day) =>
  day === 'Thursday' || day === 'Tuesday'
    ? 'chicken curry with rice'
    : day === 'Sunday'
      ? 'chicken biryani'
      : 'dal rice sabzi'
)
const chickenProfile = {
  diet_preference: 'non_vegetarian',
  weight: '82',
  height: '180',
  age: '30',
  gender: 'male',
  activity_level: 'very_active',
  fitness_goal: 'muscle_gain',
  onboarding_data: {
    diet: {
      eggAllowedDays: ['monday', 'wednesday'],
      chickenAllowedDays: ['tuesday', 'thursday'],
      fishAllowedDays: ['sunday'],
      eggDaysPerWeek: '2',
      chickenDaysPerWeek: '2',
      fishDaysPerWeek: '1',
    },
  },
}
const chickenRepaired = applyDietPlanRepair(chickenWeek, chickenProfile)
const chickenText = prose(chickenRepaired.plan)
const thu = chickenText.slice(
  chickenText.toLowerCase().indexOf('day 4 (thursday)'),
  chickenText.toLowerCase().indexOf('day 5 (friday)')
)
const sun = chickenText.slice(chickenText.toLowerCase().indexOf('day 7 (sunday)'))
assert('Thursday chicken kept', /\bchicken\b/i.test(thu))
assert('Sunday chicken swapped', !/\bchicken\b/i.test(sun))

const lactoseDirty = weekPlan(1700, () => 'paneer bhurji, curd, and 1 scoop whey')
const lactoseProfile = {
  ...adultMale,
  onboarding_data: { diet: { allergies: 'Lactose intolerant', wheyProtein: 'no' } },
}
const lactoseRepaired = applyDietPlanRepair(lactoseDirty, lactoseProfile)
const lactoseText = prose(lactoseRepaired.plan)
assert('lactose paneer gone', !/\bpaneer\b/i.test(lactoseText))
assert('lactose curd gone', !/\bcurd\b/i.test(lactoseText))
assert('lactose whey gone', !/\bwhey\b/i.test(lactoseText))
assert('lactose contract met', dietPlanMeetsContract(lactoseRepaired.plan, lactoseProfile))

const glutenDirty = weekPlan(1700, () => '2 rotis, paratha, and dal')
const glutenProfile = {
  ...adultMale,
  weight: '78',
  onboarding_data: { diet: { allergies: 'Gluten allergy / celiac', wheyProtein: 'no' } },
}
const glutenRepaired = applyDietPlanRepair(glutenDirty, glutenProfile)
const glutenText = prose(glutenRepaired.plan)
assert('gluten roti gone', !/\broti\b/i.test(glutenText))
assert('gluten paratha gone', !/\bparatha\b/i.test(glutenText))
assert('gluten contract met', dietPlanMeetsContract(glutenRepaired.plan, glutenProfile))

const jainDirty = weekPlan(1600, () => 'aloo gobi with onion and garlic tadka, carrot raita')
const jainProfile = {
  diet_preference: 'vegetarian',
  weight: '62',
  height: '160',
  age: '36',
  gender: 'female',
  activity_level: 'lightly_active',
  fitness_goal: 'fat_loss',
  onboarding_data: {
    diet: {
      foodsDisliked: 'Onion, garlic, potato',
      customNotes: 'Jain — no onion, garlic, or root vegetables (potato, onion, garlic, carrot, beetroot).',
      wheyProtein: 'no',
    },
  },
}
const jainRepaired = applyDietPlanRepair(jainDirty, jainProfile)
const jainText = prose(jainRepaired.plan)
assert('jain onion gone', !/\bonion\b/i.test(jainText))
assert('jain garlic gone', !/\bgarlic\b/i.test(jainText))
assert('jain potato/aloo gone', !/\b(potato|aloo)\b/i.test(jainText))
assert('jain carrot gone', !/\bcarrot\b/i.test(jainText))

const fastDirty = weekPlan(1600, () => 'dal, roti, sabzi')
const fastProfile = {
  diet_preference: 'vegetarian',
  weight: '63',
  height: '159',
  age: '30',
  gender: 'female',
  activity_level: 'sedentary',
  fitness_goal: 'fat_loss',
  onboarding_data: {
    diet: {
      customNotes: 'I fast every Tuesday — only fruit and milk till sunset, then a light sabzi-roti dinner.',
      wheyProtein: 'no',
    },
  },
}
const fastRepaired = applyDietPlanRepair(fastDirty, fastProfile)
const fastText = prose(fastRepaired.plan)
const tue = fastText.slice(
  fastText.toLowerCase().indexOf('day 2 (tuesday)'),
  fastText.toLowerCase().indexOf('day 3 (wednesday)')
)
assert('Tuesday marked as fast', /\b(?:fast(?:s|ing)?|vrat)\b|sunset|fruit and milk/i.test(tue))
assert('Tuesday is not a calorie-fill dump', !/calorie fill/i.test(tue))
assert('Tuesday fasting breakfast is tracker-parseable', /Breakfast:/i.test(tue))
assert('Tuesday fasting dinner is tracker-parseable', /Dinner:/i.test(tue))
assert(
  'fasting-week calories still meet contract',
  dietPlanMeetsContract(fastRepaired.plan, fastProfile),
  `kcal=${getAuthoritativeNutritionCalories(fastRepaired.plan, { skipWeekdays: ['tuesday'] })}`
)
const fastTargets = resolveClientCalorieTargets(fastProfile)
const fastNonFasting = getAuthoritativeNutritionCalories(fastRepaired.plan, { skipWeekdays: ['tuesday'] })
assert(
  'non-fasting days match Mifflin, not the weekly average including Tuesday',
  Math.abs(fastNonFasting - (fastTargets?.preferred ?? 2000)) <= 150,
  `got ${fastNonFasting} vs ${fastTargets?.preferred}`
)

const nutDirty = weekPlan(1700, () => 'apple with peanut butter and almonds')
const nutProfile = {
  ...veganSouth,
  onboarding_data: { diet: { allergies: 'Nut allergy', wheyProtein: 'no' } },
}
const nutRepaired = applyDietPlanRepair(nutDirty, nutProfile)
assert('nut allergy peanut gone', !/\bpeanut/i.test(prose(nutRepaired.plan)))
assert('nut allergy almond gone', !/\balmond/i.test(prose(nutRepaired.plan)))
assert('nut contract met', dietPlanMeetsContract(nutRepaired.plan, nutProfile))

const tofuDirty = weekPlan(2200, () => 'roti with tofu curry and salad')
const tofuRepaired = applyDietPlanRepair(tofuDirty, adultMale)
assert('vegetarian tofu swapped to paneer', !/\btofu\b/i.test(prose(tofuRepaired.plan)))
assert('vegetarian tofu became paneer', /\bpaneer\b/i.test(prose(tofuRepaired.plan)))
const veganTofu = applyDietPlanRepair(tofuDirty, veganSouth)
assert('vegan tofu kept', /\btofu\b/i.test(prose(veganTofu.plan)))

const snackMissing = weekPlan(2100, () => 'rice, dal, and sabzi')
const snackProfile = {
  ...adultMale,
  weight: '78',
  onboarding_data: {
    diet: { allergies: 'Gluten allergy / celiac', wheyProtein: 'no' },
    eatingPattern: {
      breakfast: 'Poha or idli',
      lunch: 'Rice, dal, and sabzi',
      dinner: 'Rice with dal tadka and vegetables',
      snacks: 'Fruit bowl',
      timings: {
        breakfast: '08:30',
        lunch: '13:30',
        dinner: '20:30',
        snacks: '17:00',
      },
    },
  },
}
const snackRepaired = applyDietPlanRepair(snackMissing, snackProfile)
const snackText = prose(snackRepaired.plan)
assert('missing snack food injected', /\bfruit\b/i.test(snackText))
assert('missing snack time injected', /17:00/.test(snackText))
assert('gluten snack repair did not add roti', !/\broti\b/i.test(snackText))

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll diet-plan-repair checks passed.')
