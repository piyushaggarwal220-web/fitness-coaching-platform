import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  formatGenerationFailureSubtitle,
  getGenerationFailureGuidance,
} from '../src/lib/generation-failure-guidance'
import {
  isHeicLike,
  resolveVisionMediaType,
  sniffImageMediaType,
} from '../src/lib/photo'

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const heic = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
])

assert.equal(sniffImageMediaType(jpeg), 'image/jpeg')
assert.equal(sniffImageMediaType(png), 'image/png')
assert.equal(sniffImageMediaType(heic, 'client/front.heic'), 'image/heic')
assert.equal(resolveVisionMediaType('', jpeg, 'front.jpg'), 'image/jpeg')
assert.equal(resolveVisionMediaType('image/png', png, 'side.png'), 'image/png')
assert.throws(
  () => resolveVisionMediaType('image/heic', heic, 'back.heic'),
  /HEIC|HEIF|re-upload/i
)
assert.equal(isHeicLike({ type: 'image/heic', name: 'a.jpg' }), true)
assert.equal(isHeicLike({ type: '', name: 'photo.HEIF' }), true)
assert.equal(isHeicLike({ type: 'image/jpeg', name: 'photo.jpg' }), false)

const photoGuidance = getGenerationFailureGuidance('photo_unavailable')
assert.ok(photoGuidance.nextSteps.length >= 3)
assert.match(photoGuidance.nextSteps.join(' '), /re-upload|Retry/i)
assert.match(
  formatGenerationFailureSubtitle('Alex', 'photo_unavailable', null),
  /Alex · .*Next:/i
)

const queueSrc = readFileSync(resolve('src/lib/coach-work-queue.ts'), 'utf8')
assert.match(queueSrc, /Oldest received first/)
assert.doesNotMatch(queueSrc, /initial_plan:\s*1/)
assert.match(queueSrc, /safeA - safeB/)

const configSrc = readFileSync(resolve('src/lib/ai/config.ts'), 'utf8')
assert.match(configSrc, /MAX_PLAN_TOKENS:\s*64000/)
assert.match(configSrc, /MAX_SECTION_EDIT_TOKENS:\s*64000/)

const packageJson = readFileSync(resolve('package.json'), 'utf8')
assert.match(packageJson, /"heic2any"/)

console.log('✓ photo sniffing, coach failure guidance, FIFO queue, and token ceilings verified')
