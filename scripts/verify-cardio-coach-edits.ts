/**
 * Unit checks for steps-only cardio, diet coach follow-through, and standing requests.
 * Run: npx tsx scripts/verify-cardio-coach-edits.ts
 */
import assert from 'node:assert/strict'
import {
  defaultDailyStepTarget,
  extractStepCount,
  formatStepsOnlyCardio,
  isStepsOnlyCardioPlan,
  normalizeCardioPlanToSteps,
} from '../src/lib/ai/cardio-steps'
import {
  applyCoachDietEditsToText,
  coachEditFollowthroughHint,
  dietRemovalTargets,
  foodsPresentInDiet,
} from '../src/lib/ai/coach-edit-followthrough'
import { formatStandingCoachInstructionsBlock } from '../src/lib/ai/standing-coach-instructions'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

assert.equal(extractStepCount('8000 steps'), 8000)
assert.equal(extractStepCount('Daily steps: 10,000'), 10000)
assert.equal(extractStepCount('8k steps'), 8000)
assert.equal(extractStepCount('10000'), 10000)
assert.equal(extractStepCount('LISS 30 min'), null)
pass('extracts step counts from common cardio lines')

const collapsed = normalizeCardioPlanToSteps([
  { type: 'LISS walk', duration: '30 min', frequency: '3x/week' },
  { type: 'Daily steps', notes: '9000 steps' },
])
assert.equal(collapsed, '9000 steps')
assert.equal(isStepsOnlyCardioPlan(collapsed), true)
assert.equal(isStepsOnlyCardioPlan('LISS 30 min\nHIIT 10 min'), false)
pass('collapses session blobs to a single step line')

assert.equal(normalizeCardioPlanToSteps([], null, '10000 steps'), '10000 steps')
pass('empty AI cardio keeps the previous step count')

assert.equal(defaultDailyStepTarget('under_3000'), 7000)
assert.equal(defaultDailyStepTarget('3000_6000'), 8000)
assert.equal(defaultDailyStepTarget('6000'), 8000)
assert.equal(formatStepsOnlyCardio(8750), '9000 steps')
pass('default and rounded step targets')

const standing = formatStandingCoachInstructionsBlock(
  [
    { text: 'Remove chicken and eggs on Tuesday and Thursday', section: 'nutrition', at: '2026-09-01T00:00:00.000Z' },
    { text: 'Set daily steps to 10000', section: 'cardio', at: '2026-09-02T00:00:00.000Z' },
    { text: 'Client does not want paneer. Remove paneer everywhere.', section: 'nutrition', at: '2026-09-03T00:00:00.000Z' },
  ],
  'Raise calories by 200'
)
assert.match(standing, /Standing coach requests/)
assert.match(standing, /Remove chicken/)
assert.match(standing, /10000/)
assert.match(standing, /paneer/)
assert.doesNotMatch(standing, /Raise calories by 200/)
pass('standing block keeps older requests and drops the current one')

const dietStillHasChicken = [
  'Day 1 (Monday)\nBreakfast: oats\nLunch: dal',
  'Day 2 (Tuesday)\nBreakfast: eggs\nLunch: chicken rice',
  'Day 4 (Thursday)\nDinner: chicken curry',
].join('\n\n')
const hint = coachEditFollowthroughHint(
  'nutrition',
  'please remove chicken and eggs from thursday diet tuesday also',
  dietStillHasChicken
)
assert.ok(hint && /chicken|egg/i.test(hint))
pass('diet followthrough flags leftover chicken/eggs on named days')

const cardioHint = coachEditFollowthroughHint('cardio', 'set daily steps to 10000', '8000 steps')
assert.ok(cardioHint && cardioHint.includes('10000'))
assert.equal(coachEditFollowthroughHint('cardio', 'set daily steps to 10000', '10000 steps'), null)
pass('cardio followthrough requires the requested step count')

assert.ok(dietRemovalTargets('Client does not want paneer. Remove paneer everywhere.').includes('paneer'))
assert.ok(dietRemovalTargets('drop soy and tofu from the mess plan').includes('tofu'))
assert.ok(dietRemovalTargets('Client is Jain — no onion, garlic, or root vegetables.').includes('potato'))
pass('diet removal parser catches client-told food drops')

const withPaneer = [
  'Day 1 (Monday)',
  'Breakfast: oats with fruit and chai',
  'Lunch: dal, roti, rice, and paneer sabzi',
  'Dinner: paneer curry with roti',
  'Snack: roasted chana and curd',
].join('\n')
const paneerDropped = applyCoachDietEditsToText(
  withPaneer,
  'Client does not want paneer. Remove paneer everywhere.'
)
assert.equal(foodsPresentInDiet(paneerDropped, ['paneer']).length, 0)
assert.match(paneerDropped, /dal/)
pass('applying a paneer drop removes paneer and keeps the rest')

const afterSnack = applyCoachDietEditsToText(
  paneerDropped,
  'Client does not want paneer. Remove paneer everywhere.\nAdd an evening fruit snack.'
)
assert.equal(foodsPresentInDiet(afterSnack, ['paneer']).length, 0)
pass('a later snack request does not bring paneer back')

const withBreakfast = [
  'Day 1 (Monday)',
  'Breakfast: oats with fruit',
  'Lunch: dal roti',
  'Dinner: paneer curry',
].join('\n')
const fasting = applyCoachDietEditsToText(
  withBreakfast,
  'Keep skipping breakfast as the client requested. First meal is lunch. Remove olives everywhere.'
)
assert.match(fasting, /Breakfast: skipped/i)
const laterLunch = applyCoachDietEditsToText(
  fasting,
  'Keep skipping breakfast as the client requested. First meal is lunch.\nMake lunch a bit bigger.'
)
assert.match(laterLunch, /Breakfast: skipped/i)
assert.doesNotMatch(laterLunch, /Breakfast: oats/i)
pass('skip-breakfast preference holds after a later lunch change')

const skipHint = coachEditFollowthroughHint(
  'nutrition',
  'Client skips lunch on shift days. Do not add lunch.',
  'Day 1 (Monday)\nBreakfast: paratha\nLunch: dal rice\nDinner: roti'
)
assert.ok(skipHint && /lunch/i.test(skipHint))
pass('diet followthrough flags lunch that should stay skipped')

console.log('\nAll cardio/coach-edit checks passed.')
