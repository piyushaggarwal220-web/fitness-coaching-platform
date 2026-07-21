import assert from 'node:assert/strict'
import { getCoachResponseTarget, COACH_RESPONSE_TARGET_MS } from '../src/lib/chat-response-target'
import {
  formatNextCoachWorkingHours,
  getCoachWorkingHoursStatus,
} from '../src/lib/coach-working-hours'
import {
  isCurrentPolicyAcknowledgement,
  REFUND_POLICY_VERSION,
  TERMS_POLICY_VERSION,
} from '../src/lib/policies'
import type { ConversationMessage } from '../src/types/database'

function message(
  id: string,
  sender: 'client' | 'coach',
  createdAt: string
): ConversationMessage {
  return {
    id,
    conversation_id: 'conversation',
    sender_type: sender,
    sender_id: id,
    message_type: 'text',
    content: id,
    media_url: null,
    media_duration_seconds: null,
    read_at: null,
    created_at: createdAt,
  }
}

const first = '2026-07-21T05:00:00.000Z'
const target = getCoachResponseTarget([
  message('client-1', 'client', first),
  message('client-2', 'client', '2026-07-21T05:30:00.000Z'),
])
assert(target)
assert.equal(target.startedAt, Date.parse(first), 'first unanswered message anchors the target')
assert.equal(target.deadline, Date.parse(first) + COACH_RESPONSE_TARGET_MS)
assert.equal(target.unansweredCount, 2, 'additional messages share the active target')

const beforeHours = getCoachResponseTarget([
  message('before-hours', 'client', '2026-07-21T02:00:00.000Z'),
])
assert(beforeHours)
assert.equal(beforeHours.startedAt, Date.parse('2026-07-21T03:30:00.000Z'))
assert.equal(beforeHours.deadline, Date.parse('2026-07-21T05:30:00.000Z'))

const nearClose = getCoachResponseTarget([
  message('near-close', 'client', '2026-07-21T11:30:00.000Z'),
])
assert(nearClose)
assert.equal(nearClose.startedAt, Date.parse('2026-07-21T11:30:00.000Z'))
assert.equal(
  nearClose.deadline,
  Date.parse('2026-07-22T04:30:00.000Z'),
  'response countdown pauses at 6 PM and resumes at 9 AM IST'
)

const afterHours = getCoachResponseTarget([
  message('after-hours', 'client', '2026-07-21T13:00:00.000Z'),
])
assert(afterHours)
assert.equal(afterHours.startedAt, Date.parse('2026-07-22T03:30:00.000Z'))
assert.equal(afterHours.deadline, Date.parse('2026-07-22T05:30:00.000Z'))
assert.equal(getCoachWorkingHoursStatus(new Date(first)).isOpen, true)
assert.equal(getCoachWorkingHoursStatus(new Date('2026-07-21T13:00:00.000Z')).isOpen, false)
assert.equal(
  formatNextCoachWorkingHours(new Date('2026-07-21T13:00:00.000Z')),
  'tomorrow at 9:00 AM'
)
const yearRollover = getCoachResponseTarget([
  message('year-rollover', 'client', '2026-12-31T13:00:00.000Z'),
])
assert(yearRollover)
assert.equal(yearRollover.startedAt, Date.parse('2027-01-01T03:30:00.000Z'))
assert.equal(yearRollover.deadline, Date.parse('2027-01-01T05:30:00.000Z'))

assert.equal(
  getCoachResponseTarget([
    message('client-1', 'client', first),
    message('coach-1', 'coach', '2026-07-21T05:05:00.000Z'),
  ]),
  null,
  'a later coach reply clears the target'
)

assert.equal(
  isCurrentPolicyAcknowledgement({
    termsVersion: TERMS_POLICY_VERSION,
    refundPolicyVersion: REFUND_POLICY_VERSION,
    acknowledgedAt: new Date().toISOString(),
    ipHash: null,
  }),
  true
)
assert.equal(
  isCurrentPolicyAcknowledgement({
    termsVersion: 'old',
    refundPolicyVersion: REFUND_POLICY_VERSION,
    acknowledgedAt: new Date().toISOString(),
  }),
  false,
  'stale policy versions are rejected'
)

console.log('✓ policy versions and acknowledgement enforcement')
console.log('✓ working-hours response target, multiple-message, and coach-reply behavior')
