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
  getHomePlanCardCopy,
  getHomePlanPhase,
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

const submittedMs = submittedAt.getTime()
const deliveredMs = new Date('2026-08-18T10:28:00.000Z').getTime()
assert.equal(
  getHomePlanPhase({
    hasActivePlan: true,
    expectsUpdate: true,
    submittedAtMs: submittedMs,
    deliveredAtMs: deliveredMs,
  }),
  'delivered_for_checkin'
)
assert.equal(
  getHomePlanPhase({
    hasActivePlan: true,
    expectsUpdate: true,
    submittedAtMs: submittedMs,
    deliveredAtMs: submittedMs - 60_000,
  }),
  'waiting'
)
assert.equal(
  getHomePlanPhase({
    hasActivePlan: true,
    expectsUpdate: false,
    submittedAtMs: submittedMs,
    deliveredAtMs: submittedMs - 60_000,
  }),
  'checkin_keeps_current'
)
assert.equal(
  getHomePlanPhase({
    hasActivePlan: true,
    expectsUpdate: false,
    submittedAtMs: null,
    deliveredAtMs: deliveredMs,
  }),
  'has_plan'
)

const deliveredCard = getHomePlanCardCopy({
  phase: 'delivered_for_checkin',
  planTitle: 'Week 11 Updated Plan',
  deliveredAtLabel: 'Mon, 12 Oct, 2:00 pm',
  biweekly: false,
  nextUpdateWeek: 12,
  weeklyDueNow: false,
  checkedInAt: 'Mon, 12 Oct, 1:30 pm',
  readyBy: 'Mon, 12 Oct, 2:00 pm',
  overdue: true,
})
assert.match(deliveredCard.currentLine, /Week 11 Updated Plan/)
assert.match(deliveredCard.currentLine, /My Plan/)
assert.match(deliveredCard.nextLine, /Sunday through Tuesday/)
assert.doesNotMatch(deliveredCard.nextLine, /being created|still coming/i)

const biweeklyCard = getHomePlanCardCopy({
  phase: 'checkin_keeps_current',
  planTitle: 'Week 10 Updated Plan',
  deliveredAtLabel: 'Sun, 5 Oct, 8:00 pm',
  biweekly: true,
  nextUpdateWeek: 12,
  weeklyDueNow: false,
  checkedInAt: null,
  readyBy: null,
  overdue: false,
})
assert.match(biweeklyCard.currentLine, /Week 10 Updated Plan/)
assert.match(biweeklyCard.nextLine, /week 12/)
assert.match(biweeklyCard.nextLine, /keep the plan you have/)

console.log('✓ check-in reply wait: plan goes out at 26–28 minutes, clients are told 30 minutes')
