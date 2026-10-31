import assert from 'node:assert/strict'
import { INDIAN_CITIES } from '../src/lib/diet/indian-cities'
import {
  customFoodId,
  filterFoodIds,
  hasEnoughConfirmedFoods,
  mergePlaceFoods,
  presetFoodIds,
  resolveCity,
  resolvePlace,
  searchFoods,
  searchPlaceResults,
} from '../src/lib/diet/indian-food-plate'
import { buildOnboardingData, INITIAL_ONBOARDING_FORM, validateOnboardingStep } from '../src/lib/onboarding'
import { buildDietHardConstraintsSection } from '../src/lib/ai/prompt-builder'
import type { OnboardingProfile } from '../src/types/database'

assert.ok(INDIAN_CITIES.length > 1000, 'city list is only a handful of metros')
const hyderabad = resolvePlace('Hyderabad')
assert.equal(hyderabad?.regionId, 'andhra_telangana')
assert.ok(hyderabad?.extraFoodIds.includes('biryani'))
assert.equal(resolveCity('Sitamarhi')?.regionId, 'east_plains')
assert.equal(resolveCity('Varanasi')?.regionId, 'north_wheat')
assert.equal(resolvePlace('delhi')?.label, 'Delhi')
assert.equal(resolvePlace('North India')?.regionId, 'north_wheat')
assert.equal(resolveCity('Aurangabad'), null)
assert.equal(resolvePlace('Aurangabad, Bihar')?.regionId, 'east_plains')
assert.equal(resolvePlace('no-such-city'), null)
const varanasiHits = searchPlaceResults('vara')
assert.ok(varanasiHits.total >= 1)
assert.ok(varanasiHits.matches.some((place) => place.label === 'Varanasi'))

const vegPlate = presetFoodIds('andhra_telangana', 'city', 'vegetarian', hyderabad?.extraFoodIds ?? [])
assert.ok(vegPlate.includes('idli'))
assert.ok(vegPlate.includes('biryani'))
assert.ok(!vegPlate.includes('chicken_curry'))
assert.ok(!vegPlate.includes('eggs'))

const veganPlate = presetFoodIds('north_wheat', 'home', 'vegan')
assert.ok(veganPlate.includes('roti'))
assert.ok(!veganPlate.includes('paneer'))
assert.ok(!veganPlate.includes('dahi'))
assert.ok(!veganPlate.includes('kadhi'))

const searched = searchFoods('oats', 'vegetarian')
assert.ok(searched.some((food) => food.id === 'oats'))
assert.equal(searchFoods('beef', 'vegetarian').length, 0)
assert.ok(searchFoods('beef', 'non_vegetarian').some((food) => food.id === 'beef_curry'))

const kept = mergePlaceFoods(['oats', 'roti', 'dal'], ['roti', 'dal', 'paneer'], ['idli', 'rice'], 'vegetarian')
assert.deepEqual(kept, ['idli', 'rice', 'oats'])

const makki = customFoodId('makki di roti')
assert.ok(makki)
assert.deepEqual(filterFoodIds(['roti', makki!], 'vegetarian'), ['roti', makki])
assert.equal(filterFoodIds([customFoodId('chicken')!], 'vegetarian').length, 0)
assert.equal(hasEnoughConfirmedFoods(['roti', 'dal'], 'vegetarian'), false)
assert.equal(hasEnoughConfirmedFoods(['roti', 'dal', 'rice'], 'vegetarian'), true)
assert.equal(hasEnoughConfirmedFoods(['roti', 'dal', 'chicken_curry'], 'vegetarian'), false)

const form = {
  ...INITIAL_ONBOARDING_FORM,
  diet_preference: 'vegetarian',
  breakfast: '2 idlis',
  lunch: '1 plate rice and sambar',
  staple: 'rice',
  who_cooks: 'self',
  eat_out_days: '1',
  confirmed_foods: ['idli', 'rice', 'sambar', 'chicken_curry'],
}
assert.match(
  String(validateOnboardingStep(17, { ...form, confirmed_foods: ['idli'] })),
  /at least 3 foods/
)
assert.equal(validateOnboardingStep(17, form), null)

const saved = buildOnboardingData(form, 17)
assert.deepEqual(saved.eatingPattern?.confirmedFoods, ['idli', 'rice', 'sambar'])
assert.equal(filterFoodIds(['chicken_curry'], 'vegetarian').length, 0)

const profile = {
  diet_preference: 'vegetarian',
  onboarding_data: saved,
} as OnboardingProfile
const constraints = buildDietHardConstraintsSection(profile)
assert.match(constraints, /Idli/)
assert.match(constraints, /Sambar/)
assert.doesNotMatch(constraints, /Chicken curry/)

console.log('Diet food plate checks passed.')
