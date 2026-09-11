import {
  INITIAL_WEEKLY_CALL_DELAY_MS,
  getInitialWeeklyCallWindow,
} from '../src/lib/weekly-call-timing'

function assert(label: string, ok: boolean) {
  if (!ok) {
    console.error(`FAIL ${label}`)
    process.exitCode = 1
    return
  }
  console.log(`PASS ${label}`)
}

const started = new Date('2026-01-01T00:00:00.000Z')
const day0 = new Date(started.getTime())
const day1 = new Date(started.getTime() + 24 * 60 * 60 * 1000)

assert('delay is 0 (book on delivery)', INITIAL_WEEKLY_CALL_DELAY_MS === 0)
assert('eligible immediately at schedule start', getInitialWeeklyCallWindow(started, day0).eligible === true)
assert('still eligible the next day', getInitialWeeklyCallWindow(started, day1).eligible === true)
assert(
  'earliestAfter equals schedule start when delay is 0',
  getInitialWeeklyCallWindow(started, day0).earliestAfter.getTime() === started.getTime()
)
assert('invalid date is not eligible', getInitialWeeklyCallWindow('not-a-date', new Date()).eligible === false)

if (process.exitCode) {
  console.error('\nweekly-call-timing checks failed')
  process.exit(1)
}
console.log('\nAll weekly-call-timing checks passed')
