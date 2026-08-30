import {
  INITIAL_WEEKLY_CALL_DELAY_MS,
  getInitialWeeklyCallWindow,
} from '../src/lib/weekly-call-timing'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

const started = new Date('2026-08-01T00:00:00+05:30')
const day7 = new Date(started.getTime() + 7 * 24 * 60 * 60 * 1000)
const day13 = new Date(started.getTime() + 13 * 24 * 60 * 60 * 1000)
const day14 = new Date(started.getTime() + INITIAL_WEEKLY_CALL_DELAY_MS)
const day15 = new Date(started.getTime() + 15 * 24 * 60 * 60 * 1000)

assert('delay is exactly 14 days', INITIAL_WEEKLY_CALL_DELAY_MS === 14 * 24 * 60 * 60 * 1000)
assert('week 1 is not eligible', getInitialWeeklyCallWindow(started, day7).eligible === false)
assert('day 13 is not eligible', getInitialWeeklyCallWindow(started, day13).eligible === false)
assert('day 14 is eligible', getInitialWeeklyCallWindow(started, day14).eligible === true)
assert('day 15 is eligible', getInitialWeeklyCallWindow(started, day15).eligible === true)
assert(
  'earliestAfter is start + 14d',
  getInitialWeeklyCallWindow(started, day7).earliestAfter.getTime() === day14.getTime()
)
assert(
  'invalid anchor is not eligible',
  getInitialWeeklyCallWindow('not-a-date', new Date()).eligible === false
)

if (failed > 0) {
  console.error(`\n${failed} weekly call schedule checks failed`)
  process.exit(1)
}
console.log('\nAll weekly call schedule checks passed')
