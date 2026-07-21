/**
 * Offline verification for the plan-delivery anchored recurring check-in system.
 * Run: npm run verify:checkins
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHECKIN_SUBMISSION_WINDOW_MS,
  buildScheduledCheckin,
  getCheckinUnavailableReason,
  getClientCheckinSchedule,
  getCoachingDateKey,
  getCoachingDay,
  getNextCoachingDayStart,
  getCheckinWindowEnd,
  hasCoachingDayStarted,
  isCheckinAvailableToday,
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
  const day3 = buildScheduledCheckin(anchor, 1, 'mid_week')
  const day7 = buildScheduledCheckin(anchor, 1, 'weekly')
  const week2Day3 = buildScheduledCheckin(anchor, 2, 'mid_week')
  check('Day 3 is anchor +48h', sameInstant(day3.dueDate, '2026-01-03T12:34:56.789Z'))
  check('Day 7 is anchor +144h', sameInstant(day7.dueDate, '2026-01-07T12:34:56.789Z'))
  check('Week 2 Day 3 recurs after seven days', sameInstant(week2Day3.dueDate, '2026-01-10T12:34:56.789Z'))
  check('Anchor timestamp is not rounded to local midnight', day3.dueDate.getUTCHours() === 12)

  const oneMsBefore = new Date(day3.dueDate.getTime() - 1)
  const exactDue = new Date(day3.dueDate)
  const oneMsBeforeClose = new Date(day3.dueDate.getTime() + CHECKIN_SUBMISSION_WINDOW_MS - 1)
  const exactClose = getCheckinWindowEnd(day3.dueDate)
  check('Window is closed before exact due instant', !isWithinCheckinSubmissionWindow(day3.dueDate, oneMsBefore))
  check('Window opens at exact due instant', isWithinCheckinSubmissionWindow(day3.dueDate, exactDue))
  check('Window remains open one millisecond before close', isWithinCheckinSubmissionWindow(day3.dueDate, oneMsBeforeClose))
  check('Window closes at exact +48h boundary', !isWithinCheckinSubmissionWindow(day3.dueDate, exactClose))
  check('Coaching day uses elapsed 24-hour periods', getCoachingDay(anchor, exactDue) === 3)

  console.log('\nRecurrence and progression:')
  const week1Complete = [
    { checkin_type: 'mid_week' as const, coaching_week: 1, coaching_day: 3 },
    { checkin_type: 'weekly' as const, coaching_week: 1, coaching_day: 7 },
  ]
  const week2Schedule = getClientCheckinSchedule(
    anchor,
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
