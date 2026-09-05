/**
 * Offline checks for the weekly client Excel report.
 * Run: npx tsx scripts/verify-weekly-workbook.ts
 */
import * as XLSX from 'xlsx'
import { coachingWeekLogDates } from '../src/lib/checkin-schedule'
import {
  buildWeeklyWorkbook,
  weeklyWorkbookFilename,
} from '../src/lib/client-reports/weekly-workbook'
import type { Checkin } from '../src/types/database'
import type { DailyTrackerDay } from '../src/lib/daily-tracker/types'

let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
    failed += 1
  } else {
    console.log(`PASS ${label}`)
  }
}

const checkin = {
  id: 'c1',
  client_id: 'client-1',
  coach_id: 'coach-1',
  submitted_at: '2026-09-06T10:00:00.000Z',
  checkin_type: 'weekly',
  coaching_week: 2,
  coaching_day: 14,
  weight: 74.2,
  chest: 96,
  thigh: 55,
  navel: 82,
  diet_adherence: 8,
  workout_adherence: 7,
  days_followed_diet: 6,
  days_followed_workout: 4,
  energy_level: 7,
  sleep_quality: 8,
  stress_level: 4,
  hunger_level: 5,
  motivation_level: 8,
  progress_rating: 7,
  progress_notes: 'Sleeves feel looser.',
  digestion: 'Good',
  pain_injuries: null,
  cardio_completed: 'Walks',
  progress_photo_front: 'https://example.com/front.jpg',
} as Checkin

const previous = {
  ...checkin,
  id: 'c0',
  coaching_week: 1,
  weight: 75.0,
  navel: 84,
  submitted_at: '2026-08-30T10:00:00.000Z',
} as Checkin

const weekDates = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']
const trackerDays: DailyTrackerDay[] = [
  {
    id: 'd1',
    client_id: 'client-1',
    log_date: '2026-09-01',
    plan_id: 'p1',
    plan_version: 1,
    coaching_day: 9,
    coaching_week: 2,
    snapshot: {
      generatedAt: '',
      planId: 'p1',
      planVersion: 1,
      planTitle: 'Week',
      items: [
        {
          id: 'meal-breakfast',
          type: 'meal',
          period: 'morning',
          icon: '',
          title: 'Breakfast',
          foods: 'Poha',
          sortOrder: 1,
        },
        {
          id: 'w1',
          type: 'workout',
          period: 'workout',
          icon: '',
          title: 'Main',
          phases: [],
          exercises: [
            {
              id: 'ex-bench',
              name: 'Bench press',
              targetSets: 3,
              targetReps: '8',
              phase: 'main',
            },
          ],
          sortOrder: 2,
        },
      ],
    },
    completion: {
      meals: { 'meal-breakfast': { completed: true } },
      water: { ml: 2800 },
      sleep: { hours: 7.5 },
      exercises: {
        'ex-bench': {
          completed: false,
          sets: [
            { reps: 8, weight: 60, completed: true },
            { reps: 8, weight: 62.5, completed: true },
          ],
        },
      },
      workoutSession: { status: 'saved', durationSeconds: 2400 },
    },
    scores: { diet: 100, workout: 80, water: 90, supplements: 0, cardio: 0, sleep: 80 },
    overall_percent: 85,
    created_at: '',
    updated_at: '',
  },
]

const buffer = buildWeeklyWorkbook({
  clientName: 'Sriram Rathod',
  clientEmail: 'shreeram8690@gmail.com',
  coachingWeek: 2,
  checkin,
  previousCheckin: previous,
  trackerDays,
  weekDates,
})

assert('workbook is a real xlsx buffer', buffer.length > 200)
const book = XLSX.read(buffer, { type: 'buffer' })
assert(
  'has weekly, daily, and sets sheets',
  book.SheetNames.join('|') === 'Weekly check-in|Daily tracker|Workout sets',
  book.SheetNames.join('|')
)

const weekly = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets['Weekly check-in']!, { header: 1 })
const weightRow = weekly.find((row) => row[0] === 'Weight (kg)')
assert('weight this week is 74.2', weightRow?.[1] === 74.2, String(weightRow?.[1]))
assert('weight last week is 75', weightRow?.[2] === 75, String(weightRow?.[2]))
assert('weight change is -0.8', weightRow?.[3] === -0.8, String(weightRow?.[3]))

const daily = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets['Daily tracker']!, { header: 1 })
assert('daily sheet has header + 7 days', daily.length === 8, String(daily.length))
const logged = daily.find((row) => row[0] === '2026-09-01')
assert('logged day shows Yes', logged?.[10] === 'Yes')
assert('logged day meals done is 1', logged?.[5] === 1)
const blank = daily.find((row) => row[0] === '2026-08-31')
assert('unopened day stays blank / No', blank?.[10] === 'No')

const sets = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets['Workout sets']!, { header: 1 })
assert('set log includes 62.5 kg', sets.some((row) => row[4] === 62.5))
assert(
  'filename is client-safe',
  weeklyWorkbookFilename('Sriram Rathod', 2) === 'Lurvox-Week-2-Sriram-Rathod.xlsx'
)

const dates = coachingWeekLogDates('2026-08-03T00:00:00+05:30', 1)
assert('week dates are 7 IST keys', dates.length === 7 && dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))

if (failed > 0) {
  console.error(`\n${failed} weekly workbook checks failed`)
  process.exit(1)
}
console.log('\nAll weekly workbook checks passed')
