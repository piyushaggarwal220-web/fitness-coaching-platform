/**
 * Verifies recurring check-in system: schema, scheduling logic, and journey integration.
 * Run: npm run verify:checkins
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  buildScheduledCheckin,
  getAbsoluteCoachingDay,
  getClientCheckinSchedule,
  getCoachingDay,
} from '../src/lib/checkin-schedule'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

let passed = 0
let failed = 0

function ok(label: string) {
  console.log(`  ✓ ${label}`)
  passed++
}

function fail(label: string, detail?: string) {
  console.log(`  ✗ ${label}${detail ? `: ${detail}` : ''}`)
  failed++
}

async function main() {
  console.log('=== Recurring Check-in System Verification ===\n')

  console.log('Scheduling logic:')
  const onboarding = new Date('2026-01-01T12:00:00Z')

  const day3Week1 = getAbsoluteCoachingDay(1, 3)
  const day7Week1 = getAbsoluteCoachingDay(1, 7)
  const day3Week2 = getAbsoluteCoachingDay(2, 3)
  const day7Week2 = getAbsoluteCoachingDay(2, 7)

  if (day3Week1 === 3) ok('Week 1 Day 3 = coaching day 3')
  else fail('Week 1 Day 3', `got ${day3Week1}`)

  if (day7Week1 === 7) ok('Week 1 Day 7 = coaching day 7')
  else fail('Week 1 Day 7', `got ${day7Week1}`)

  if (day3Week2 === 10) ok('Week 2 Day 3 = coaching day 10')
  else fail('Week 2 Day 3', `got ${day3Week2}`)

  if (day7Week2 === 14) ok('Week 2 Day 7 = coaching day 14')
  else fail('Week 2 Day 7', `got ${day7Week2}`)

  const week1MidDue = buildScheduledCheckin(onboarding, 1, 'mid_week')
  const week1WeeklyDue = buildScheduledCheckin(onboarding, 1, 'weekly')
  if (week1MidDue.coachingDay === 3) ok('Mid-week scheduled on day 3')
  else fail('Mid-week day', String(week1MidDue.coachingDay))

  if (week1WeeklyDue.coachingDay === 7) ok('Weekly scheduled on day 7')
  else fail('Weekly day', String(week1WeeklyDue.coachingDay))

  const jan3 = new Date('2026-01-03T10:00:00Z')
  const coachingDayJan3 = getCoachingDay(onboarding, jan3)
  if (coachingDayJan3 === 3) ok('Jan 3 is coaching day 3')
  else fail('Jan 3 coaching day', `got ${coachingDayJan3}`)

  const scheduleOnDay3 = getClientCheckinSchedule(onboarding.toISOString(), [], jan3)
  if (scheduleOnDay3.todayTasks.some((t) => t.type === 'mid_week' && t.status === 'available')) {
    ok('Mid-week task available on day 3')
  } else {
    fail('Mid-week availability on day 3')
  }

  console.log('\nDatabase schema:')

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const checkinCols = [
    'checkin_type',
    'coaching_week',
    'coaching_day',
    'due_date',
    'diet_adherence',
    'workout_adherence',
    'sleep_quality',
    'stress_level',
    'motivation_level',
    'pain_injuries',
    'questions_for_coach',
    'cardio_completed',
    'extra_photos',
    'plan_version',
  ]

  const { error: checkinColErr } = await sb.from('checkins').select(checkinCols.join(',')).limit(0)
  if (checkinColErr) fail('checkins new columns', checkinColErr.message)
  else ok('checkins extended columns present')

  const { error: journeyErr } = await sb.from('journey_entries').select('id, client_id, checkin_id, entry_date, plan_version').limit(0)
  if (journeyErr) fail('journey_entries table', journeyErr.message)
  else ok('journey_entries table present')

  const { error: profileErr } = await sb.from('profiles').select('checkin_awaiting, checkin_overdue').limit(0)
  if (profileErr) fail('profiles checkin flags', profileErr.message)
  else ok('profiles checkin_awaiting/checkin_overdue columns')

  const apiRoute = join(process.cwd(), 'src/app/api/checkin/submit/route.ts')
  if (existsSync(apiRoute)) ok('POST /api/checkin/submit route exists')
  else fail('API route missing')

  const midWeekPage = join(process.cwd(), 'src/app/checkin/mid-week/page.tsx')
  if (existsSync(midWeekPage)) ok('/checkin/mid-week page exists')
  else fail('Mid-week page missing')

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
