/**
 * Offline verification for 12-month plan Day-7 auto weekly call booking windows.
 * Run: npm run verify:auto-weekly-calls
 */
import {
  getAutoWeeklyCallSlot,
  isTwelveMonthActiveSubscription,
} from '../src/lib/auto-weekly-calls'
import { getDueDate } from '../src/lib/checkin-schedule'

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}${detail === undefined ? '' : `: ${String(detail)}`}`)
    failed++
  }
}

function main() {
  console.log('=== Auto Weekly Call Booking Verification ===\n')
  const anchor = '2026-01-01T18:30:00.000Z' // coaching Day 1 midnight IST

  console.log('Day 7 only:')
  const day6 = new Date('2026-01-06T18:30:00.000Z') // start of day 6
  const day7 = new Date('2026-01-07T18:30:00.000Z') // start of day 7
  const day7End = new Date('2026-01-08T18:29:59.999Z') // still day 7
  const day8 = new Date('2026-01-08T18:30:00.000Z') // day 8 / week 2 day 1

  check('No slot before Day 7', getAutoWeeklyCallSlot(anchor, day6) === null)
  const slotDay7 = getAutoWeeklyCallSlot(anchor, day7)
  check('Slot opens on Day 7', slotDay7?.coachingWeek === 1)
  check(
    'Day 7 due matches weekly check-in due',
    slotDay7?.dueDate.toISOString() === getDueDate(anchor, 1, 7).toISOString()
  )
  check('Slot remains open through end of Day 7', getAutoWeeklyCallSlot(anchor, day7End)?.coachingWeek === 1)
  check('Slot closes on Day 8', getAutoWeeklyCallSlot(anchor, day8) === null)

  console.log('\nWeek 2 recurrence:')
  const week2Day7 = new Date('2026-01-14T18:30:00.000Z')
  check('Week 2 Day 7 books week 2', getAutoWeeklyCallSlot(anchor, week2Day7)?.coachingWeek === 2)

  console.log('\n12-month eligibility:')
  const purchase = {
    plan_slug: '12_months',
    plan_name: '12 Months',
    created_at: '2026-01-01T00:00:00.000Z',
    status: 'captured' as const,
  }
  check(
    'Active 12-month purchase is eligible',
    isTwelveMonthActiveSubscription(purchase, '2027-01-01T00:00:00.000Z', new Date('2026-06-01T00:00:00.000Z'))
  )
  check(
    '3-month purchase is not eligible',
    !isTwelveMonthActiveSubscription(
      { ...purchase, plan_slug: '3_months', plan_name: '3 Months' },
      '2026-04-01T00:00:00.000Z',
      new Date('2026-02-01T00:00:00.000Z')
    )
  )
  check(
    'Expired 12-month purchase is not eligible',
    !isTwelveMonthActiveSubscription(purchase, '2026-02-01T00:00:00.000Z', new Date('2026-06-01T00:00:00.000Z'))
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
