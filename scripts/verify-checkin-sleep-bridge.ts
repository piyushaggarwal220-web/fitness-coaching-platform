import assert from 'node:assert/strict'
import {
  averageSleepMetricsFromDays,
  checkinSleepToTrackerPatch,
  shouldWriteBackCheckinSleepToTracker,
} from '../src/lib/checkin-sleep-bridge'

const days = [
  {
    log_date: '2026-08-18',
    completion: { sleep: { quality: 9, qualityLabel: 'excellent' as const, energy: 8 } },
  },
  {
    log_date: '2026-08-17',
    completion: { sleep: { quality: 7, qualityLabel: 'good' as const, energy: 6 } },
  },
  {
    log_date: '2026-08-16',
    completion: { sleep: { hours: 7 } },
  },
  {
    log_date: '2026-08-10',
    completion: { sleep: { quality: 3, qualityLabel: 'poor' as const, energy: 2 } },
  },
]

const all = averageSleepMetricsFromDays(days, { maxDays: 7 })
assert.equal(all.sleepQuality, 6) // (9+7+3)/3 → 6
assert.equal(all.energy, 5) // (8+6+2)/3 → 5
assert.equal(all.sampleCount, 3)

const since = averageSleepMetricsFromDays(days, { sinceLogDate: '2026-08-16', maxDays: 7 })
assert.equal(since.sleepQuality, 8) // only 9 and 7 (Aug 18, 17) — Aug 16 hours-only skipped, Aug 10 excluded
assert.equal(since.energy, 7) // (8+6)/2
assert.equal(since.sampleCount, 2)

const empty = averageSleepMetricsFromDays([{ log_date: '2026-08-18', completion: {} }])
assert.equal(empty.sleepQuality, null)
assert.equal(empty.energy, null)
assert.equal(empty.sampleCount, 0)

const patch = checkinSleepToTrackerPatch(8)
assert.equal(patch.quality, 8)
assert.equal(patch.qualityLabel, 'excellent')

assert.equal(shouldWriteBackCheckinSleepToTracker(undefined), true)
assert.equal(shouldWriteBackCheckinSleepToTracker({}), true)
assert.equal(shouldWriteBackCheckinSleepToTracker({ hours: 7 }), true)
assert.equal(shouldWriteBackCheckinSleepToTracker({ quality: 7 }), false)

console.log('✓ check-in ↔ sleep tracker bridge')
