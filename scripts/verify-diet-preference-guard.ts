/**
 * Offline unit checks for diet preference guard.
 * Run: npx tsx scripts/verify-diet-preference-guard.ts
 */
import {
  calorieBumpFoodsForProfile,
  enforceDietPreference,
  findDietPreferenceViolations,
} from '../src/lib/ai/diet-preference-guard'

let failed = 0

function assert(label: string, ok: boolean, detail?: string) {
  if (!ok) {
    failed++
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    console.log(`PASS ${label}`)
  }
}

const veganBad = 'Have 2 rotis with paneer bhurji and 1 tsp ghee. Curd on the side.'
const veganOk =
  'Have 2 rotis with soya bhurji cooked in 1 tsp mustard oil and a katori of dal. Peanut chutney on the side.'
const vegBad = 'Breakfast: 3 eggs omelette and chicken sausage.'
const vegOk = 'Breakfast: paneer bhurji with 2 rotis and curd.'
const eggplantOk = 'Dinner: eggplant bharta with roti and dal.' // must not flag "egg"

assert(
  'vegan detects paneer/ghee/curd',
  findDietPreferenceViolations(veganBad, 'vegan').length >= 3
)
assert('vegan clean plan passes', findDietPreferenceViolations(veganOk, 'vegan').length === 0)
assert(
  'peanut butter does not false-positive butter',
  findDietPreferenceViolations('1 tbsp peanut butter with apple', 'vegan').length === 0
)
assert(
  'dairy butter still flagged',
  findDietPreferenceViolations('1 tsp butter on roti', 'vegan').some((v) => v.term === 'butter')
)
assert('vegetarian detects eggs/chicken', findDietPreferenceViolations(vegBad, 'vegetarian').length >= 2)
assert('vegetarian dairy plan passes', findDietPreferenceViolations(vegOk, 'vegetarian').length === 0)
assert(
  'eggplant does not false-positive egg',
  findDietPreferenceViolations(eggplantOk, 'vegetarian').length === 0
)

const enforced = enforceDietPreference(
  { meals: [{ meal: 'Weekly Diet Plan', example: veganBad }] },
  'vegan'
)
assert('enforceDietPreference rejects vegan dairy', !enforced.ok)
if (!enforced.ok) {
  assert('hint mentions oil only', /oil only/i.test(enforced.hint))
}

const enforcedOk = enforceDietPreference(
  { meals: [{ meal: 'Weekly Diet Plan', example: veganOk }] },
  'vegan'
)
assert('enforceDietPreference accepts vegan oil plan', enforcedOk.ok)

const sundayEggs = `Day 1 (Monday)
Breakfast: egg bhurji with roti
Day 2 (Tuesday)
Breakfast: poha with peanuts
Day 7 (Sunday)
Breakfast: 3 eggs omelette`

const weekdayFail = enforceDietPreference(
  { meals: [{ example: sundayEggs }] },
  'eggetarian',
  { eggAllowedDays: ['monday', 'wednesday', 'friday'] }
)
assert('eggs on Sunday fail when only M/W/F allowed', !weekdayFail.ok)
if (!weekdayFail.ok) {
  assert('weekday hint names Sunday constraint', /weekday/i.test(weekdayFail.hint))
}

const weekdayOk = enforceDietPreference(
  { meals: [{ example: sundayEggs.replace('3 eggs omelette', 'poha with peanuts') }] },
  'eggetarian',
  { eggAllowedDays: ['monday', 'wednesday', 'friday'] }
)
assert('eggs only on Monday pass M/W/F rule', weekdayOk.ok)

const chickenSunday = `Day 4 (Thursday)
Lunch: chicken curry with rice
Day 7 (Sunday)
Lunch: chicken biryani`
const chickenFail = enforceDietPreference(
  { meals: [{ example: chickenSunday }] },
  'non_vegetarian',
  { chickenAllowedDays: ['tuesday', 'thursday'] }
)
assert('chicken on Sunday fails Tue/Thu-only', !chickenFail.ok)

const wheyFail = enforceDietPreference(
  { meals: [{ example: 'Post workout: 1 scoop whey with water' }] },
  'vegetarian',
  { wheyProtein: 'no' }
)
assert('whey flagged when client does not use it', !wheyFail.ok)

const wheyRestated = enforceDietPreference(
  { meals: [{ example: 'No whey. Dal, soya, and paneer for protein.' }] },
  'vegetarian',
  { wheyProtein: 'no' }
)
assert('restated "no whey" is not a serving', wheyRestated.ok)

const lactoseFail = enforceDietPreference(
  { meals: [{ example: 'Lunch: paneer bhurji with curd' }] },
  'vegetarian',
  { allergies: 'Lactose intolerant' }
)
assert('lactose flags paneer and curd', !lactoseFail.ok)

const nutFail = enforceDietPreference(
  { meals: [{ example: 'Snack: apple with peanut butter' }] },
  'vegan',
  { allergies: 'Nut allergy' }
)
assert('nut allergy flags peanut butter', !nutFail.ok)

const veganBump = calorieBumpFoodsForProfile({ diet_preference: 'vegan' })
assert('vegan calorie bump never suggests ghee/paneer', !/ghee|paneer/i.test(veganBump) || /never ghee/i.test(veganBump))
assert('vegan calorie bump uses oil and soya', /oil/i.test(veganBump) && /soya/i.test(veganBump))

const lactoseBump = calorieBumpFoodsForProfile({
  diet_preference: 'vegetarian',
  onboarding_data: { diet: { allergies: 'Lactose intolerant' } },
})
assert('lactose calorie bump forbids dairy', /never ghee|never .*paneer/i.test(lactoseBump))

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll diet-preference-guard checks passed.')
