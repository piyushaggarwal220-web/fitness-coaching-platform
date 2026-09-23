/**
 * Offline verification for the plan-delivery anchored recurring check-in system.
 * Run: npm run verify:checkins
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHECKIN_SUBMISSION_WINDOW_MS,
  WEEKLY_SUBMISSION_WINDOW_MS,
  buildScheduledCheckin,
  getCheckinUnavailableReason,
  getClientCheckinSchedule,
  getCoachingDateKey,
  getCoachingDay,
  getNextCoachingDayStart,
  getCheckinWindowEnd,
  getScheduleWeekOneStart,
  hasCoachingDayStarted,
  isCheckinAvailableToday,
  isSlotBeforeScheduleStart,
  isWithinCheckinSubmissionWindow,
} from '../src/lib/checkin-schedule'

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

function sameInstant(actual: Date, expectedIso: string): boolean {
  return actual.toISOString() === expectedIso
}

function main() {
  console.log('=== Anchored Check-in Schedule Verification ===\n')
  const anchor = '2026-01-01T12:34:56.789Z'

  console.log('Pre-delivery gating:')
  const preDelivery = getClientCheckinSchedule(null, [], new Date('2026-01-20T00:00:00Z'))
  check('No schedule exists before first plan delivery', !preDelivery.scheduleAnchored)
  check('No pre-delivery tasks are exposed', preDelivery.weekCheckins.length === 0)
  check('No pre-delivery check-in is available', !isCheckinAvailableToday(null, 'mid_week', []))
  check(
    'Pre-delivery reason is explicit',
    getCheckinUnavailableReason(null, 'weekly', []) === 'plan_not_delivered'
  )

  console.log('\nFirst coaching day:')
  const deliveredAt = new Date('2026-01-01T12:34:56.789Z')
  const firstDayStart = getNextCoachingDayStart(deliveredAt)
  check(
    'First day starts at the following midnight IST',
    sameInstant(firstDayStart, '2026-01-01T18:30:00.000Z')
  )
  check(
    'Schedule remains closed before midnight IST',
    !hasCoachingDayStarted(firstDayStart, new Date('2026-01-01T18:29:59.999Z'))
  )
  check(
    'Schedule opens exactly at midnight IST',
    hasCoachingDayStarted(firstDayStart, new Date('2026-01-01T18:30:00.000Z'))
  )
  check(
    'Tracker date keys use the India coaching date',
    getCoachingDateKey(new Date('2026-01-01T18:30:00.000Z')) === '2026-01-02'
  )

  console.log('\nExact timestamps and windows:')
  // Product contract: mid-week = Wednesday 00:00 IST, weekly = Sunday 00:00 IST
  // of the client's Nth coaching week (calendar rhythm), not elapsed +48h from the exact
  // delivery timestamp. Late-week starts (Fri–Sun) roll week 1 to the following Monday.
  const thursdayAnchor = '2026-01-01T12:34:56.789Z' // Thursday IST → current week Mon–Sun
  const day3 = buildScheduledCheckin(thursdayAnchor, 1, 'mid_week')
  const day7 = buildScheduledCheckin(thursdayAnchor, 1, 'weekly')
  const week2Day3 = buildScheduledCheckin(thursdayAnchor, 2, 'mid_week')
  check(
    'Week 1 starts Monday 00:00 IST for a Thursday delivery',
    sameInstant(getScheduleWeekOneStart(thursdayAnchor), '2025-12-28T18:30:00.000Z')
  )
  check(
    'Day 3 (mid-week) is Wednesday 00:00 IST of week 1',
    sameInstant(day3.dueDate, '2025-12-30T18:30:00.000Z')
  )
  check(
    'Day 7 (weekly) is Sunday 00:00 IST of week 1',
    sameInstant(day7.dueDate, '2026-01-03T18:30:00.000Z')
  )
  check(
    'Week 2 mid-week is the following Wednesday 00:00 IST',
    sameInstant(week2Day3.dueDate, '2026-01-06T18:30:00.000Z')
  )
  check(
    'Calendar due dates land on IST midnight (not the raw delivery clock)',
    day3.dueDate.getUTCHours() === 18 && day3.dueDate.getUTCMinutes() === 30
  )
  check(
    'Mid-week before a Thursday start is skipped (not the client’s miss)',
    isSlotBeforeScheduleStart(thursdayAnchor, day3.dueDate)
  )

  const oneMsBefore = new Date(day7.dueDate.getTime() - 1)
  const exactDue = new Date(day7.dueDate)
  const oneMsBeforeClose = new Date(day7.dueDate.getTime() + WEEKLY_SUBMISSION_WINDOW_MS - 1)
  const exactClose = getCheckinWindowEnd(day7.dueDate, 'weekly')
  check('Window is closed before exact due instant', !isWithinCheckinSubmissionWindow(day7.dueDate, oneMsBefore, 'weekly'))
  check('Window opens at exact due instant', isWithinCheckinSubmissionWindow(day7.dueDate, exactDue, 'weekly'))
  check('Window remains open one millisecond before close', isWithinCheckinSubmissionWindow(day7.dueDate, oneMsBeforeClose, 'weekly'))
  check('Window closes at exact +72h weekly boundary', !isWithinCheckinSubmissionWindow(day7.dueDate, exactClose, 'weekly'))
  check('Coaching day uses elapsed 24-hour periods', getCoachingDay(thursdayAnchor, exactDue) === 3)

  const mondayAnchor = '2026-01-05T04:30:00.000Z' // Monday 10:00 IST
  const mondayMidWeek = buildScheduledCheckin(mondayAnchor, 1, 'mid_week')
  const mondayWeekly = buildScheduledCheckin(mondayAnchor, 1, 'weekly')
  check(
    'Monday start keeps mid-week in the same calendar week',
    sameInstant(mondayMidWeek.dueDate, '2026-01-06T18:30:00.000Z') &&
      !isSlotBeforeScheduleStart(mondayAnchor, mondayMidWeek.dueDate)
  )
  check(
    'Monday start weekly is that Sunday 00:00 IST',
    sameInstant(mondayWeekly.dueDate, '2026-01-10T18:30:00.000Z')
  )

  const midWeekOpen = new Date(mondayMidWeek.dueDate.getTime() + CHECKIN_SUBMISSION_WINDOW_MS - 1)
  const midWeekClose = getCheckinWindowEnd(mondayMidWeek.dueDate, 'mid_week')
  check(
    'Mid-week stays open for 48h',
    isWithinCheckinSubmissionWindow(mondayMidWeek.dueDate, midWeekOpen, 'mid_week')
  )
  check(
    'Mid-week closes at exact +48h boundary',
    !isWithinCheckinSubmissionWindow(mondayMidWeek.dueDate, midWeekClose, 'mid_week')
  )

  const weeklyOpenTue = new Date(day7.dueDate.getTime() + WEEKLY_SUBMISSION_WINDOW_MS - 1)
  const weeklyClose = getCheckinWindowEnd(day7.dueDate, 'weekly')
  check(
    'Weekly stays open through Tuesday (72h)',
    isWithinCheckinSubmissionWindow(day7.dueDate, weeklyOpenTue, 'weekly')
  )
  check(
    'Weekly closes at Wednesday midnight (end of Tuesday)',
    !isWithinCheckinSubmissionWindow(day7.dueDate, weeklyClose, 'weekly')
  )

  console.log('\nRecurrence and progression:')
  const week1Complete = [
    { checkin_type: 'mid_week' as const, coaching_week: 1, coaching_day: 3 },
    { checkin_type: 'weekly' as const, coaching_week: 1, coaching_day: 7 },
  ]
  const week2Schedule = getClientCheckinSchedule(
    thursdayAnchor,
    week1Complete,
    new Date('2026-01-08T12:34:56.789Z')
  )
  check('Completed week advances to week 2', week2Schedule.activeCoachingWeek === 2)
  check(
    'Next recurring slot is week 2 mid-week',
    week2Schedule.nextCheckin?.type === 'mid_week' &&
      week2Schedule.nextCheckin.coachingWeek === 2
  )

  console.log('\nMigration contract:')
  const migrationPath = join(
    process.cwd(),
    'supabase/migrations/20260721143000_checkin_schedule_anchor.sql'
  )
  const migration = readFileSync(migrationPath, 'utf8')
  check('Migration adds profile anchor', migration.includes('checkin_schedule_started_at timestamptz'))
  check('Migration adds exact check-in due timestamp', migration.includes('due_at timestamptz'))
  check('Backfill uses earliest delivered plan', migration.includes('MIN(delivered_at)'))
  check(
    'Later plans cannot replace the anchor',
    /checkin_schedule_started_at\s*=\s*COALESCE\(\s*p\.checkin_schedule_started_at,/m.test(migration)
  )
  check('Historical due_at backfill is present', migration.includes('UPDATE checkins c'))

  const midnightMigration = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260721164500_first_coaching_day_midnight.sql'
    ),
    'utf8'
  )
  check(
    'Database derives the first day at next midnight IST',
    midnightMigration.includes("date_trunc('day', $1 AT TIME ZONE 'Asia/Kolkata')")
  )
  check(
    'Both privileged profile triggers use the midnight helper',
    (midnightMigration.match(/first_coaching_day_start\(MIN\(/g) ?? []).length === 2
  )

  const plansSource = readFileSync(join(process.cwd(), 'src/lib/plans.ts'), 'utf8')
  check(
    'New first-plan deliveries anchor at next midnight',
    plansSource.includes('getNextCoachingDayStart(firstDelivery)')
  )

  check(
    'Submission API exists',
    existsSync(join(process.cwd(), 'src/app/api/checkin/submit/route.ts'))
  )
  check(
    'Both check-in forms exist',
    existsSync(join(process.cwd(), 'src/app/checkin/page.tsx')) &&
      existsSync(join(process.cwd(), 'src/app/checkin/mid-week/page.tsx'))
  )

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
