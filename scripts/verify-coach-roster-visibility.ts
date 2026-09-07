import assert from 'node:assert/strict'
import {
  coachAcceptsAutoAssignment,
  coachRequiresManualPlanDelivery,
  shouldScheduleCheckinAutoReply,
} from '../src/lib/coach-delivery-policy'
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
assert.equal(coachRequiresManualPlanDelivery(PIYUSH_COACH_ID), true)
assert.equal(coachRequiresManualPlanDelivery(RAKSHIT_COACH_ID), true)
assert.equal(shouldScheduleCheckinAutoReply('mid_week', PIYUSH_COACH_ID), true)
assert.equal(shouldScheduleCheckinAutoReply('mid_week', RAKSHIT_COACH_ID), true)
assert.equal(shouldScheduleCheckinAutoReply('weekly', PIYUSH_COACH_ID), false)
assert.equal(shouldScheduleCheckinAutoReply('weekly', RAKSHIT_COACH_ID), false)

console.log('✓ trial clients stay hidden; weekly plans are manual; mid-week auto-replies for both coaches')
