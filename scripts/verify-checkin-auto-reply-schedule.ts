import assert from 'node:assert/strict'
import {
  AUTO_REPLY_MIN_DELAY_MS,
  AUTO_REPLY_MAX_DELAY_MS,
  computeAutoReplyAt,
} from '../src/lib/checkin-auto-reply-schedule'

assert.equal(AUTO_REPLY_MIN_DELAY_MS, 3 * 60 * 60 * 1000)
assert.equal(AUTO_REPLY_MAX_DELAY_MS, 6 * 60 * 60 * 1000)

const submitted = new Date('2026-08-18T10:00:00.000Z')

const atMin = computeAutoReplyAt(submitted, () => 0)
assert.ok(atMin.getTime() - submitted.getTime() >= AUTO_REPLY_MIN_DELAY_MS - 1)

const atMax = computeAutoReplyAt(submitted, () => 1)
assert.ok(atMax.getTime() - submitted.getTime() <= AUTO_REPLY_MAX_DELAY_MS + 1)

const overnight = new Date('2026-08-18T18:30:00.000Z') // 00:00 IST
const overnightReply = computeAutoReplyAt(overnight, () => 0)
assert.ok(overnightReply.getTime() - overnight.getTime() >= AUTO_REPLY_MIN_DELAY_MS - 1)
assert.equal(overnightReply.getUTCHours(), 21) // 03:00 IST — night send is allowed

console.log('✓ auto-reply schedule: 3–6h window, night sends allowed, 3h minimum enforced')
