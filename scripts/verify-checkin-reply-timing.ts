import assert from 'node:assert/strict'
import {
  CHECKIN_REPLY_MIN_WAIT_MS,
  CHECKIN_REPLY_OVERDUE_MS,
  CHECKIN_REPLY_TARGET_WAIT_MS,
  CHECKIN_REPLY_USUAL_MAX_HOURS,
  CHECKIN_REPLY_USUAL_MIN_HOURS,
  assertCheckinReplyWaitElapsed,
  getAwaitingReviewClientCopy,
  getCheckinReplyTiming,
  getClientCheckinReplyExpectationCopy,
  getCoachReplyWaitMessage,
} from '../src/lib/checkin-reply-timing'

assert.equal(CHECKIN_REPLY_MIN_WAIT_MS, 4 * 60 * 60 * 1000)
assert.equal(CHECKIN_REPLY_USUAL_MIN_HOURS, 3)
assert.equal(CHECKIN_REPLY_USUAL_MAX_HOURS, 8)
assert.equal(CHECKIN_REPLY_TARGET_WAIT_MS, 3 * 60 * 60 * 1000)
assert.equal(CHECKIN_REPLY_OVERDUE_MS, 8 * 60 * 60 * 1000)

const submittedAt = new Date('2026-08-18T10:00:00.000Z')

const at2h = getCheckinReplyTiming(submittedAt, new Date('2026-08-18T12:00:00.000Z'))
assert.ok(at2h)
assert.equal(at2h.canSend, false)
assert.equal(at2h.inUsualWindow, false)
assert.ok(at2h.remainingMinWaitMs > 0)
assert.match(getCoachReplyWaitMessage(at2h), /at least 4 hours/i)

const blocked = assertCheckinReplyWaitElapsed(submittedAt, new Date('2026-08-18T12:00:00.000Z'))
assert.equal(blocked.ok, false)

const at4h = getCheckinReplyTiming(submittedAt, new Date('2026-08-18T14:00:00.000Z'))
assert.ok(at4h)
assert.equal(at4h.canSend, true)
assert.equal(at4h.inUsualWindow, true)

const at6h = getCheckinReplyTiming(submittedAt, new Date('2026-08-18T16:00:00.000Z'))
assert.ok(at6h)
assert.equal(at6h.canSend, true)
assert.equal(at6h.inUsualWindow, true)
assert.equal(at6h.overdueUsualWindow, false)
assert.match(getCoachReplyWaitMessage(at6h), /usual 3–8 hour/i)

const at9h = getCheckinReplyTiming(submittedAt, new Date('2026-08-18T19:00:00.000Z'))
assert.ok(at9h)
assert.equal(at9h.overdueUsualWindow, true)

const allowed = assertCheckinReplyWaitElapsed(submittedAt, new Date('2026-08-18T16:00:00.000Z'))
assert.equal(allowed.ok, true)

assert.match(getClientCheckinReplyExpectationCopy(), /3–8 hours/)
assert.match(getAwaitingReviewClientCopy(at2h), /3–8 hours/)

console.log('✓ check-in reply wait: min 4h manual, usual 3–8h auto')
