import assert from 'node:assert/strict'
import {
  capturedNetPaidPaise,
  clientChatNavLabel,
  maxCapturedPaidPaise,
  paidAmountQualifiesForPiyushHumanCoach,
  purchasesQualifyForPiyushHumanCoach,
} from '../src/lib/coach-routing'
import { PIYUSH_COACH_ID } from '../src/lib/coach-delivery-policy'
import { clientHasCoachChat, clientHasDualChat, coachIdHasClientChat } from '../src/lib/coach-service'

assert.equal(capturedNetPaidPaise({ status: 'captured', amount_paise: 89900 }), 89900)
assert.equal(capturedNetPaidPaise({ status: 'redeemed', amount_paise: 149900 }), 0)
assert.equal(
  capturedNetPaidPaise({
    status: 'captured',
    amount_paise: 229900,
    refunded_amount_paise: 229900,
    subscription_status: 'refunded',
  }),
  0
)
assert.equal(
  capturedNetPaidPaise({ status: 'captured', amount_paise: 34900, plan_slug: 'exercise_library' }),
  0
)
assert.equal(
  capturedNetPaidPaise({ status: 'captured', amount_paise: 6900, plan_slug: 'exercise_videos_monthly' }),
  0
)
assert.equal(paidAmountQualifiesForPiyushHumanCoach(139900), false)
assert.equal(paidAmountQualifiesForPiyushHumanCoach(140000), true)
assert.equal(paidAmountQualifiesForPiyushHumanCoach(149900), true)
assert.equal(
  purchasesQualifyForPiyushHumanCoach([
    { status: 'captured', amount_paise: 89900, plan_slug: '3_months' },
    { status: 'captured', amount_paise: 229900, plan_slug: '12_months' },
  ]),
  true
)
assert.equal(
  purchasesQualifyForPiyushHumanCoach([{ status: 'captured', amount_paise: 89900, plan_slug: '3_months' }]),
  false
)
assert.equal(
  maxCapturedPaidPaise([
    { status: 'captured', amount_paise: 59900 },
    { status: 'captured', amount_paise: 99900 },
  ]),
  99900
)

assert.equal(clientChatNavLabel({ coach_service: 'ai', coach_id: PIYUSH_COACH_ID }), 'Chat')
assert.equal(clientChatNavLabel({ coach_service: 'human', coach_id: PIYUSH_COACH_ID }), 'Chat')
assert.equal(clientChatNavLabel({ coach_service: 'human', coach_id: 'unknown' }), 'Coach')
assert.equal(clientHasCoachChat({ coach_id: PIYUSH_COACH_ID }), true)
assert.equal(clientHasDualChat({ coach_id: PIYUSH_COACH_ID }), true)
assert.equal(clientHasDualChat({ coach_id: 'c0e44f5c-28c6-4a93-8a2f-d7ed69172b2a' }), false)
assert.equal(coachIdHasClientChat(PIYUSH_COACH_ID), false)
assert.equal(clientHasCoachChat({ coach_id: 'c0e44f5c-28c6-4a93-8a2f-d7ed69172b2a' }), true)
assert.equal(clientHasCoachChat({ coach_id: null }), true)

console.log('OK: paid-amount coach routing')
