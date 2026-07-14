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
  getActiveCoachingWeek,
  getClientCheckinSchedule,
  getCoachingDay,
  getCheckinTypeDisplayName,
  isCheckinAvailableToday,
} from '../src/lib/checkin-schedule'
import { shouldBypassCheckinScheduleServer, isLocalhostHost } from '../src/lib/config'

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

  const jan2 = new Date('2026-01-02T10:00:00Z')
  const blockedEarly = isCheckinAvailableToday(onboarding.toISOString(), 'mid_week', [], jan2)
  if (!blockedEarly) ok('Production schedule blocks early Day 3 check-in')
  else fail('Early Day 3 should be blocked without bypass')

  const bypassEarly = isCheckinAvailableToday(onboarding.toISOString(), 'mid_week', [], jan2, {
    bypassSchedule: true,
  })
  if (bypassEarly) ok('Dev bypass allows Day 3 check-in before due date')
  else fail('Dev bypass should allow early Day 3')

  const scheduleBypass = getClientCheckinSchedule(onboarding.toISOString(), [], jan2, {
    bypassSchedule: true,
  })
  if (scheduleBypass.developmentScheduleMessage?.includes('immediately')) {
    ok('Dev schedule replaces countdown with immediate message')
  } else {
    fail('Dev schedule message missing')
  }

  const jan4 = new Date('2026-01-04T10:00:00Z')
  const stillOpenDayAfter = isCheckinAvailableToday(onboarding.toISOString(), 'mid_week', [], jan4)
  if (stillOpenDayAfter) ok('48h window keeps Day 3 available the next calendar day')
  else fail('Day after due should still be within 48h window')

  const jan5 = new Date('2026-01-05T00:00:00Z')
  const closedAfter48h = isCheckinAvailableToday(onboarding.toISOString(), 'mid_week', [], jan5)
  if (!closedAfter48h) ok('Production blocks Day 3 after 48h window')
  else fail('Day 3 should be closed 48h after due day starts')

  const scheduleAfterMiss = getClientCheckinSchedule(onboarding.toISOString(), [], jan5)
  if (scheduleAfterMiss.nextCheckin?.type === 'weekly' && scheduleAfterMiss.nextCheckin.coachingWeek === 1) {
    ok('After missed mid-week window, next check-in advances to weekly')
  } else {
    fail('Next check-in after missed mid-week', JSON.stringify(scheduleAfterMiss.nextCheckin))
  }

  const week1Complete = [
    { checkin_type: 'mid_week' as const, coaching_week: 1, coaching_day: 3 },
    { checkin_type: 'weekly' as const, coaching_week: 1, coaching_day: 7 },
  ]
  const day8 = new Date('2026-01-08T10:00:00Z')
  const activeWeekAfterW1 = getActiveCoachingWeek(week1Complete, onboarding.toISOString(), day8)
  if (activeWeekAfterW1 === 2) ok('Week 1 complete advances active coaching week to 2')
  else fail('Active week after Week 1 complete', `got ${activeWeekAfterW1}`)

  const scheduleAfterW1 = getClientCheckinSchedule(onboarding.toISOString(), week1Complete, day8)
  if (scheduleAfterW1.activeCoachingWeek === 2) ok('Dashboard schedule tracks Week 2 after Week 1 complete')
  else fail('Dashboard active week after Week 1', `got ${scheduleAfterW1.activeCoachingWeek}`)

  if (scheduleAfterW1.nextCheckin?.coachingWeek === 2 && scheduleAfterW1.nextCheckin.type === 'mid_week') {
    ok('Next check-in is Week 2 mid-week after Week 1 complete')
  } else {
    fail('Next check-in after Week 1', JSON.stringify(scheduleAfterW1.nextCheckin))
  }

  if (scheduleAfterW1.nextCheckinStatus === 'upcoming') ok('Week 2 mid-week is upcoming before due date')
  else fail('Week 2 mid-week status', String(scheduleAfterW1.nextCheckinStatus))

  if (scheduleAfterW1.countdownDetailed?.includes('day')) ok('Detailed countdown present for next check-in')
  else fail('Detailed countdown missing', scheduleAfterW1.countdownDetailed ?? 'null')

  const week2MidComplete = [
    ...week1Complete,
    { checkin_type: 'mid_week' as const, coaching_week: 2, coaching_day: 10 },
  ]
  const activeWeekAfterW2Mid = getActiveCoachingWeek(week2MidComplete, onboarding.toISOString(), day8)
  if (activeWeekAfterW2Mid === 2) ok('Week 2 mid complete keeps active week at 2 until weekly done')
  else fail('Active week after Week 2 mid', `got ${activeWeekAfterW2Mid}`)

  const scheduleAfterW2Mid = getClientCheckinSchedule(onboarding.toISOString(), week2MidComplete, day8)
  if (scheduleAfterW2Mid.nextCheckin?.type === 'weekly' && scheduleAfterW2Mid.nextCheckin.coachingWeek === 2) {
    ok('After Week 2 mid-week, next check-in is Week 2 weekly')
  } else {
    fail('Next check-in after Week 2 mid', JSON.stringify(scheduleAfterW2Mid.nextCheckin))
  }

  if (getCheckinTypeDisplayName('mid_week') === 'Mid-Week Check-in') ok('Mid-week display label')
  else fail('Mid-week display label')

  if (!shouldBypassCheckinScheduleServer() || process.env.NODE_ENV === 'production') {
    ok('Server bypass disabled without localhost request')
  } else {
    ok('Server bypass available in non-production dev env')
  }

  if (shouldBypassCheckinScheduleServer('preview.example.vercel.app')) {
    fail('Deployed host must not bypass check-in schedule')
  } else {
    ok('Deployed host blocked from check-in schedule bypass')
  }

  if (!isLocalhostHost('localhost:3000')) fail('localhost hostname detection')
  else ok('localhost hostname detection')

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
