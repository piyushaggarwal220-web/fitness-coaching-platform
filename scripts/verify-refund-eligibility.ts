import assert from 'node:assert/strict'
import { getDueDate, MID_WEEK_DAY, WEEKLY_DAY } from '../src/lib/checkin-schedule'
import { computeRefundCheckinEligibility } from '../src/lib/payments/refund-eligibility'
import type { CheckinType } from '../src/types/database'

const anchor = new Date('2026-01-01T00:00:00.000Z')

function submission(week: number, type: CheckinType, offsetMs: number) {
  const day = type === 'mid_week' ? MID_WEEK_DAY : WEEKLY_DAY
  const due = getDueDate(anchor, week, day)
  return {
    id: `${week}-${type}`,
    checkinType: type,
    coachingWeek: week,
    dueAt: due.toISOString(),
    submittedAt: new Date(due.getTime() + offsetMs).toISOString(),
  }
}

const fortyEightHours = 48 * 60 * 60 * 1000
const tenDue = Array.from({ length: 5 }, (_, index) => index + 1).flatMap((week) => [
  submission(week, 'mid_week', 60 * 60 * 1000),
  submission(week, 'weekly', 60 * 60 * 1000),
])
const afterTenWindows = new Date(getDueDate(anchor, 5, WEEKLY_DAY).getTime() + fortyEightHours + 1)

const exactNinety = computeRefundCheckinEligibility({
  scheduleStartedAt: anchor.toISOString(),
  submissions: tenDue.map((row, index) =>
    index === 9 ? submission(5, 'weekly', fortyEightHours) : row
  ),
  evaluatedAt: afterTenWindows,
})
assert.equal(exactNinety.dueCount, 10)
assert.equal(exactNinety.onTimeCount, 9)
assert.equal(exactNinety.percentage, 90)
assert.equal(exactNinety.status, 'eligible')

const belowThreshold = computeRefundCheckinEligibility({
  scheduleStartedAt: anchor.toISOString(),
  submissions: tenDue.map((row, index) =>
    index >= 8
      ? submission(index === 8 ? 5 : 5, index === 8 ? 'mid_week' : 'weekly', fortyEightHours)
      : row
  ),
  evaluatedAt: afterTenWindows,
})
assert.equal(belowThreshold.onTimeCount, 8)
assert.equal(belowThreshold.status, 'ineligible')

const firstDue = getDueDate(anchor, 1, MID_WEEK_DAY)
const justInside = computeRefundCheckinEligibility({
  scheduleStartedAt: anchor.toISOString(),
  submissions: [submission(1, 'mid_week', fortyEightHours - 1)],
  evaluatedAt: new Date(firstDue.getTime() + fortyEightHours + 1),
})
assert.equal(justInside.onTimeCount, 1)
assert.equal(justInside.status, 'eligible')

const exactDeadline = computeRefundCheckinEligibility({
  scheduleStartedAt: anchor.toISOString(),
  submissions: [submission(1, 'mid_week', fortyEightHours)],
  evaluatedAt: new Date(firstDue.getTime() + fortyEightHours + 1),
})
assert.equal(exactDeadline.onTimeCount, 0)
assert.equal(exactDeadline.status, 'ineligible')

const openWindow = computeRefundCheckinEligibility({
  scheduleStartedAt: anchor.toISOString(),
  submissions: [],
  evaluatedAt: new Date(firstDue.getTime() + 60 * 60 * 1000),
})
assert.equal(openWindow.openWindowCount, 1)
assert.equal(openWindow.status, 'pending')

const noDue = computeRefundCheckinEligibility({
  scheduleStartedAt: anchor.toISOString(),
  submissions: [],
  evaluatedAt: anchor,
})
assert.equal(noDue.dueCount, 0)
assert.equal(noDue.status, 'ineligible')

console.log('✓ Exactly 90% is eligible')
console.log('✓ Below 90% is ineligible')
console.log('✓ 48-hour deadline is exclusive')
console.log('✓ Open windows remain pending')
console.log('✓ No due check-ins is ineligible')
