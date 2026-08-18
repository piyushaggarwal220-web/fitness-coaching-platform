import assert from 'node:assert/strict'
import {
  buildTrackerSnapshot,
  mergeCompletion,
  sleepHoursFromOnboarding,
} from '../src/lib/daily-tracker/parser'
import { calculateTrackerScores, isItemComplete } from '../src/lib/daily-tracker/scores'
import { getCategoryDisplayScores } from '../src/lib/daily-tracker/display'
import type { Plan } from '../src/types/database'

const plan = {
  id: 'plan-1',
  client_id: 'client-1',
  coach_id: 'coach-1',
  title: 'Week 2 Plan',
  phase: null,
  version: 1,
  active: true,
  nutrition_plan: 'Breakfast\nOats',
  workout_plan: '',
  cardio_plan: '',
  supplement_plan: '',
  coach_notes: 'Bed by 11 PM. Aim for 7 hours of sleep.',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  delivered_at: null,
} as Plan

assert.equal(sleepHoursFromOnboarding('less_than_6'), 5.5)
assert.equal(sleepHoursFromOnboarding('6_to_7'), 6.5)
assert.equal(sleepHoursFromOnboarding('7_to_8'), 7.5)
assert.equal(sleepHoursFromOnboarding('8_plus'), 8)
assert.equal(sleepHoursFromOnboarding(''), null)
assert.equal(sleepHoursFromOnboarding(null), null)

const withEnum = buildTrackerSnapshot(plan, { sleep_duration: '7_to_8' } as never)
const sleepFromNotes = withEnum.items.find((i) => i.type === 'sleep')
assert.ok(sleepFromNotes && sleepFromNotes.type === 'sleep')
assert.equal(sleepFromNotes.targetHours, 7, 'coach-note hours must win over onboarding enum')
assert.equal(sleepFromNotes.targetBedtime, '11 PM')

const enumOnly = buildTrackerSnapshot(
  { ...plan, coach_notes: 'Stay consistent this week.' },
  { sleep_duration: '6_to_7' } as never
)
const sleepEnum = enumOnly.items.find((i) => i.type === 'sleep')
assert.ok(sleepEnum && sleepEnum.type === 'sleep')
assert.equal(sleepEnum.targetHours, 6.5, 'onboarding enum maps when notes have no hours')

const snap = withEnum
const scoreOf = (completion: Parameters<typeof calculateTrackerScores>[1]) =>
  calculateTrackerScores(snap, completion).scores.sleep

assert.equal(scoreOf({}), 0)
assert.equal(scoreOf({ sleep: { bedtime: '11 PM' } }), 0, 'bedtime alone must not score 100')
assert.equal(scoreOf({ sleep: { hours: -2 } }), 0, 'negative hours clamp to 0 score')
assert.equal(scoreOf({ sleep: { hours: 7 } }), 100)
assert.equal(scoreOf({ sleep: { quality: 7 } }), 70)
assert.equal(scoreOf({ sleep: { hours: 3.5, quality: 9 } }), 50)

const sleepItem = sleepFromNotes
assert.equal(isItemComplete(sleepItem, { sleep: { hours: 0 } }), true)
assert.equal(isItemComplete(sleepItem, { sleep: { bedtime: 'x' } }), false)

const cleared = mergeCompletion(
  { sleep: { hours: 7, quality: 9, qualityLabel: 'excellent', wakeFeeling: 'fresh' } },
  { sleep: { hours: null, quality: null, qualityLabel: null, wakeFeeling: null } }
)
assert.deepEqual(cleared.sleep, {})

const emptyScores = calculateTrackerScores(snap, {}).scores
const day = {
  id: 'd1',
  client_id: 'c',
  log_date: '2026-08-18',
  plan_id: 'plan-1',
  plan_version: 1,
  coaching_day: 1,
  coaching_week: 1,
  snapshot: snap,
  completion: mergeCompletion({}, { sleep: { hours: 7 } }),
  scores: emptyScores,
  overall_percent: 0,
  created_at: '',
  updated_at: '',
}
assert.equal(getCategoryDisplayScores(day).sleep, 100, 'display scores follow live completion')

console.log('✓ sleep tracker parsing, scoring, clear, and live display scores')
