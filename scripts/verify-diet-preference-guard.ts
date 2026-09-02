/**
 * Offline unit checks for diet preference guard.
 * Run: npx tsx scripts/verify-diet-preference-guard.ts
 */
import {
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

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll diet-preference-guard checks passed.')
