import assert from 'node:assert/strict'
import {
  CHECKIN_REPLY_MIN_WAIT_MS,
  CHECKIN_REPLY_OVERDUE_MS,
  CHECKIN_REPLY_TARGET_WAIT_MS,
  CHECKIN_REPLY_USUAL_MAX_MINUTES,
  CHECKIN_REPLY_USUAL_MIN_MINUTES,
  UPDATED_PLAN_READY_WITHIN_MS,
  assertCheckinReplyWaitElapsed,
  getAwaitingReviewClientCopy,
  getCheckinReplyTiming,
  getClientCheckinReplyExpectationCopy,
  getCoachReplyWaitMessage,
} from '../src/lib/checkin-reply-timing'

assert.equal(CHECKIN_REPLY_MIN_WAIT_MS, 26 * 60 * 1000)
assert.equal(CHECKIN_REPLY_USUAL_MIN_MINUTES, 26)
assert.equal(CHECKIN_REPLY_USUAL_MAX_MINUTES, 28)
assert.equal(CHECKIN_REPLY_TARGET_WAIT_MS, 26 * 60 * 1000)
assert.equal(CHECKIN_REPLY_OVERDUE_MS, 30 * 60 * 1000)
assert.equal(UPDATED_PLAN_READY_WITHIN_MS, 30 * 60 * 1000)

const submittedAt = new Date('2026-08-18T10:00:00.000Z')

const at10m = getCheckinReplyTiming(submittedAt, new Date('2026-08-18T10:10:00.000Z'))
assert.ok(at10m)
assert.equal(at10m.canSend, false)
assert.equal(at10m.inUsualWindow, false)
assert.ok(at10m.remainingMinWaitMs > 0)
assert.match(getCoachReplyWaitMessage(at10m), /at least 26 minutes/i)

const blocked = assertCheckinReplyWaitElapsed(submittedAt, new Date('2026-08-18T10:10:00.000Z'))
assert.equal(blocked.ok, false)

const at27m = getCheckinReplyTiming(submittedAt, new Date('2026-08-18T10:27:00.000Z'))
assert.ok(at27m)
assert.equal(at27m.canSend, true)
assert.equal(at27m.inUsualWindow, true)
assert.equal(at27m.overdueUsualWindow, false)
assert.match(getCoachReplyWaitMessage(at27m), /26–28 minutes/i)

const at31m = getCheckinReplyTiming(submittedAt, new Date('2026-08-18T10:31:00.000Z'))
assert.ok(at31m)
assert.equal(at31m.overdueUsualWindow, true)

const allowed = assertCheckinReplyWaitElapsed(submittedAt, new Date('2026-08-18T10:27:00.000Z'))
assert.equal(allowed.ok, true)

assert.match(getClientCheckinReplyExpectationCopy(), /30 minutes/)
assert.match(getAwaitingReviewClientCopy(at10m), /30 minutes/)

console.log('✓ check-in reply wait: plan goes out at 26–28 minutes, clients are told 30 minutes')
