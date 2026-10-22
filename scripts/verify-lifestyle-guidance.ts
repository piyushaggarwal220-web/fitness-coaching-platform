/**
 * Water, sleep, and steps guidance must be present on every coaching plan.
 */
import { extractStepCount } from '../src/lib/ai/cardio-steps'
import {
  applyLifestyleGuidance,
  buildSleepWaterGuidance,
  defaultSleepHours,
  defaultWaterLiters,
  textHasSleepGuidance,
  textHasWaterGuidance,
  withSleepWaterGuidance,
} from '../src/lib/lifestyle-guidance'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed += 1
  } else {
    console.log(`PASS ${label}`)
  }
}

assert('low water habit becomes 2L', defaultWaterLiters('under_1L') === 2)
assert('mid water habit becomes 3L', defaultWaterLiters('2_3L') === 3)
assert('unknown water becomes 3L', defaultWaterLiters(null) === 3)
assert('short sleep becomes 7h', defaultSleepHours('less_than_6') === 7)
assert('7-8 sleep becomes 8h', defaultSleepHours('7_to_8') === 8)
assert('unknown sleep becomes 8h', defaultSleepHours(null) === 8)

const profile = {
  sleep_duration: '7_to_8',
  onboarding_data: { lifestyle: { dailySteps: 'under_3000', waterIntake: '1_2L' } },
}

const filled = applyLifestyleGuidance(
  { cardio_plan: '', coach_notes: 'Keep the consistency going.' },
  profile
)
assert('empty cardio gets a step target', extractStepCount(filled.cardio_plan) === 7000)
assert('notes gain sleep guidance', textHasSleepGuidance(filled.coach_notes))
assert('notes gain water guidance', textHasWaterGuidance(filled.coach_notes))
assert('pep talk is kept', filled.coach_notes.includes('Keep the consistency going.'))
assert('added flags are true', filled.addedSteps && filled.addedSleepWater)

const already = applyLifestyleGuidance(
  {
    cardio_plan: '10000 steps',
    coach_notes: '@@META{"generatedBy":"ai","week":2}@@\nSleep: get 8 hours.\nWater: drink 3 liters a day.',
  },
  profile
)
assert('existing steps stay', already.cardio_plan === '10000 steps')
assert('existing sleep/water is not rewritten', already.addedSleepWater === false)
assert('meta stays', already.coach_notes.includes('@@META'))

const block = buildSleepWaterGuidance(profile)
assert('block names sleep and water', /Sleep:/.test(block) && /Water:/.test(block))
assert(
  'duplicate guard works',
  withSleepWaterGuidance(block, profile) === block
)

if (failed > 0) {
  console.error(`${failed} lifestyle guidance checks failed`)
  process.exit(1)
}
console.log('lifestyle guidance ok')
