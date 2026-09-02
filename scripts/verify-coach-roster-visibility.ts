import assert from 'node:assert/strict'
import { coachAcceptsAutoAssignment } from '../src/lib/coach-delivery-policy'
import { isTrialClientHiddenFromCoaches } from '../src/lib/coach-roster-visibility'

const PIYUSH_COACH_ID = 'fde68466-fb3e-4a24-a5f2-97a60a363690'
const RAKSHIT_COACH_ID = 'c0e44f5c-28c6-4a93-8a2f-d7ed69172b2a'

assert.equal(
  isTrialClientHiddenFromCoaches({
    email: 'trial-abc@trial.test.local',
    access_source: 'admin_trial',
  }),
  true
)
assert.equal(
  isTrialClientHiddenFromCoaches({
    email: 'paying@example.com',
    access_source: 'purchase',
  }),
  false
)
assert.equal(
  isTrialClientHiddenFromCoaches({
    email: 'client@test.local',
    access_source: 'admin_trial',
  }),
  false
)
assert.equal(
  isTrialClientHiddenFromCoaches({
    email: 'hidden-trial@example.com',
    access_source: 'admin_trial',
  }),
  true
)

assert.equal(coachAcceptsAutoAssignment(PIYUSH_COACH_ID), false)
assert.equal(coachAcceptsAutoAssignment(RAKSHIT_COACH_ID), true)
assert.equal(coachAcceptsAutoAssignment(null), false)

console.log('✓ trial clients stay hidden from coaches; Piyush is opt-out of auto-assign')
