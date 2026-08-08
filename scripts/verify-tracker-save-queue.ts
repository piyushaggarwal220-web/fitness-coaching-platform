/**
 * Offline checks for tracker save merge / concurrency helpers.
 * Run: npx tsx scripts/verify-tracker-save-queue.ts
 */
import { mergeCompletion } from '../src/lib/daily-tracker/parser'
import type { TrackerCompletion } from '../src/lib/daily-tracker/types'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

// Simulate the client queue coalescing rapid set patches + final save.
const setPatch: TrackerCompletion = {
  exercises: {
    bench: { completed: false, sets: [{ reps: 8, weight: 60, completed: true }] },
  },
}
const setPatch2: TrackerCompletion = {
  exercises: {
    row: { completed: true, sets: [{ reps: 10, weight: 40, completed: true }] },
  },
}
const savePatch: TrackerCompletion = {
  workoutSession: {
    status: 'saved',
    savedAt: '2026-07-30T12:00:00.000Z',
    durationSeconds: 2400,
  },
}

const coalesced = mergeCompletion(mergeCompletion(setPatch, setPatch2), savePatch)
assert(
  'coalesced queue keeps both exercises and saved session',
  coalesced.exercises?.bench?.sets?.[0]?.completed === true &&
    coalesced.exercises?.row?.completed === true &&
    coalesced.workoutSession?.status === 'saved' &&
    coalesced.workoutSession?.durationSeconds === 2400
)

// Stale exercise-only write must not wipe a previously saved session when merged
// onto the latest server state (server retry path).
const serverAfterSave: TrackerCompletion = {
  exercises: coalesced.exercises,
  workoutSession: coalesced.workoutSession,
}
const lateStaleSet: TrackerCompletion = {
  exercises: {
    bench: { completed: false, sets: [{ reps: 8, weight: 60, completed: true }] },
  },
}
const afterLateMerge = mergeCompletion(serverAfterSave, lateStaleSet)
assert(
  'merging a late set patch onto saved server state keeps workoutSession',
  afterLateMerge.workoutSession?.status === 'saved'
)

// Day selections must survive merge even when server completion is empty
// (failed PATCH / rebuild race) — this is what "Change day" relies on.
const daySelectDraft: TrackerCompletion = {
  selectedDietDay: 'day-3',
  selectedWorkoutDay: 'day-2',
}
const afterDaySelect = mergeCompletion({}, daySelectDraft)
assert(
  'day selection merge keeps diet + workout day keys',
  afterDaySelect.selectedDietDay === 'day-3' && afterDaySelect.selectedWorkoutDay === 'day-2'
)

const serverWithOldDay: TrackerCompletion = {
  selectedDietDay: 'day-1',
  selectedWorkoutDay: 'day-1',
}
const afterChangeDay = mergeCompletion(serverWithOldDay, {
  selectedDietDay: 'day-4',
  selectedWorkoutDay: 'day-5',
})
assert(
  'Change day overwrites previous Day 1 selection',
  afterChangeDay.selectedDietDay === 'day-4' && afterChangeDay.selectedWorkoutDay === 'day-5'
)

if (failed > 0) {
  console.error(`\n${failed} tracker save checks failed`)
  process.exit(1)
}

console.log('\nAll tracker save checks passed')
