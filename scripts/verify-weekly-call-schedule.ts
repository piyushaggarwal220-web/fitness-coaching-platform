import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

const DAY_MS = 24 * 60 * 60 * 1000
const started = new Date('2026-01-01T00:00:00.000Z')
const day0 = new Date(started.getTime())
const day6 = new Date(started.getTime() + 6 * DAY_MS)
const day7 = new Date(started.getTime() + 7 * DAY_MS)

assert('delay is 7 days', INITIAL_WEEKLY_CALL_DELAY_MS === 7 * DAY_MS)
assert('not eligible on day 0', getInitialWeeklyCallWindow(started, day0).eligible === false)
assert('not eligible on day 6', getInitialWeeklyCallWindow(started, day6).eligible === false)
assert('eligible on day 7', getInitialWeeklyCallWindow(started, day7).eligible === true)
assert(
  'earliestAfter is schedule start + 7 days',
  getInitialWeeklyCallWindow(started, day0).earliestAfter.getTime() === started.getTime() + 7 * DAY_MS
)
assert('invalid date is not eligible', getInitialWeeklyCallWindow('not-a-date', new Date()).eligible === false)

const scheduleSrc = readFileSync(resolve('src/lib/weekly-call-schedule.ts'), 'utf8')
assert('completion schedules next call after 7 days', /Date\.now\(\) \+ 7 \* 24 \* 60 \* 60 \* 1000/.test(scheduleSrc))
assert('ensureWeeklyCall honors after gate', /before_after_gate/.test(scheduleSrc))
assert('ensureWeeklyCall skips recently completed', /recently_completed/.test(scheduleSrc))

if (process.exitCode) {
  console.error('\nweekly-call-timing checks failed')
  process.exit(1)
}
console.log('\nAll weekly-call-timing checks passed')
