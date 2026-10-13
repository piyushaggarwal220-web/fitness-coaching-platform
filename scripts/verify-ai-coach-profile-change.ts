import assert from 'node:assert/strict'
import { clientRequestedCalories, resolveClientCalorieTargets } from '../src/lib/ai/calorie-targets'
import {
  extractProfileChangeFromText,
  parseProfileChangeJson,
  stripProfileChangeTrailer,
} from '../src/lib/ai/ai-coach-profile-change-pure'

const trailer = stripProfileChangeTrailer(
  'I will set your weight to 74 kg.\n<<<PROFILE_CHANGE {"summary":"weight 74","columns":{"weight":"74","role":"admin","email":"a@b.c"},"onboarding":{"measurements":{"leftBicep":"32","nope":"1"}},"photoSlot":"front","calorieTarget":2100}>>>'
)
assert.equal(trailer.visible.includes('PROFILE_CHANGE'), false)
assert.equal(trailer.propose?.columns.weight, '74')
assert.equal(trailer.propose?.columns.role, undefined)
assert.equal(trailer.propose?.columns.email, undefined)
assert.equal(trailer.propose?.onboarding.measurements?.leftBicep, '32')
assert.equal(trailer.propose?.onboarding.measurements?.nope, undefined)
assert.equal(trailer.propose?.photoSlot, 'front')
assert.equal(trailer.propose?.calorieTarget, 2100)
assert.equal(trailer.propose?.photoPath, null)

assert.equal(parseProfileChangeJson('{"columns":{"weight":"20"}}'), null)
assert.equal(parseProfileChangeJson('{"calorieTarget":900}'), null)
assert.equal(parseProfileChangeJson('{"columns":{"coach_id":"x"}}'), null)

const fromText = extractProfileChangeFromText(
  'Please update my weight to 81 kg and set 2400 kcal',
  null
)
assert.equal(fromText?.columns.weight, '81')
assert.equal(fromText?.calorieTarget, 2400)

assert.equal(extractProfileChangeFromText('My plan is 2200 kcal today', null), null)

const photo = extractProfileChangeFromText('this is my front photo', 'user-1/ai-chat/front.jpg')
assert.equal(photo?.photoSlot, 'front')
assert.equal(photo?.photoPath, 'user-1/ai-chat/front.jpg')

const targets = resolveClientCalorieTargets({
  weight: 80,
  height: 175,
  age: 30,
  gender: 'male',
  activity_level: 'moderately_active',
  fitness_goal: 'fat_loss',
  onboarding_data: { version: 1, resumeStep: 0, diet: { requestedCalories: 2400 } },
})
assert.ok(targets)
assert.equal(targets?.preferred, 2400)
assert.equal(clientRequestedCalories({ onboarding_data: { version: 1, resumeStep: 0, diet: { requestedCalories: 900 } } }), null)

console.log('ai coach profile change checks passed')
