import assert from 'node:assert/strict'
import {
  AUTO_REPLY_MIN_DELAY_MS,
  AUTO_REPLY_MAX_DELAY_MS,
  computeAutoReplyAt,
} from '../src/lib/checkin-auto-reply-schedule'

assert.equal(AUTO_REPLY_MIN_DELAY_MS, 3 * 60 * 60 * 1000)
assert.equal(AUTO_REPLY_MAX_DELAY_MS, 8 * 60 * 60 * 1000)

const submitted = new Date('2026-08-18T10:00:00.000Z')

const atMin = computeAutoReplyAt(submitted, () => 0)
assert.ok(atMin.getTime() - submitted.getTime() >= AUTO_REPLY_MIN_DELAY_MS - 1)

const atMax = computeAutoReplyAt(submitted, () => 1)
assert.ok(atMax.getTime() - submitted.getTime() <= AUTO_REPLY_MAX_DELAY_MS + 1)

// Early-morning submit: quiet-hours reschedule must still respect the 3h floor.
const earlyIst = new Date('2026-08-18T01:30:00.000Z') // 07:00 IST
const earlyReply = computeAutoReplyAt(earlyIst, () => 0)
assert.ok(
  earlyReply.getTime() - earlyIst.getTime() >= AUTO_REPLY_MIN_DELAY_MS - 1,
  'quiet-hours bump must not send before 3 hours'
)

console.log('✓ auto-reply schedule: 3–8h window, 3h minimum enforced')
