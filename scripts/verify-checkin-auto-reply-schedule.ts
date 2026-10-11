import assert from 'node:assert/strict'
import {
  AUTO_REPLY_MIN_DELAY_MS,
  AUTO_REPLY_MAX_DELAY_MS,
  computeAutoReplyAt,
} from '../src/lib/checkin-auto-reply-schedule'

assert.equal(AUTO_REPLY_MIN_DELAY_MS, 26 * 60 * 1000)
assert.equal(AUTO_REPLY_MAX_DELAY_MS, 28 * 60 * 1000)

const submitted = new Date('2026-08-18T10:00:00.000Z')

const atMin = computeAutoReplyAt(submitted, () => 0)
assert.equal(atMin.getTime() - submitted.getTime(), AUTO_REPLY_MIN_DELAY_MS)

const atMax = computeAutoReplyAt(submitted, () => 1)
assert.equal(atMax.getTime() - submitted.getTime(), AUTO_REPLY_MAX_DELAY_MS)

const overnight = new Date('2026-08-18T18:30:00.000Z') // 00:00 IST
const overnightReply = computeAutoReplyAt(overnight, () => 0)
assert.equal(overnightReply.getTime() - overnight.getTime(), AUTO_REPLY_MIN_DELAY_MS)

console.log('✓ auto-reply schedule: 26–28 minute window, night sends allowed')
