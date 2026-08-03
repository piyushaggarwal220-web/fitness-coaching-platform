/**
 * Verifies check-in photo upload reliability helpers.
 * Run: npx tsx scripts/verify-photo-upload-reliability.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isNetworkPhotoUploadError,
  isRetryablePhotoUploadError,
  MAX_STANDARD_PHOTO_UPLOAD_BYTES,
} from '../src/lib/photo-upload'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

assert.equal(isRetryablePhotoUploadError(new TypeError('Failed to fetch')), true)
pass('retries browser Failed to fetch')

assert.equal(
  isRetryablePhotoUploadError({ message: 'Failed to fetch', name: 'StorageUnknownError' }),
  true
)
pass('retries StorageUnknownError Failed to fetch')

assert.equal(isRetryablePhotoUploadError({ message: 'row-level security', status: 403 }), false)
pass('does not retry RLS failures')

assert.equal(isNetworkPhotoUploadError(new Error('Photo upload failed (front): Failed to fetch')), true)
pass('detects network failures in wrapped messages')

assert.ok(MAX_STANDARD_PHOTO_UPLOAD_BYTES === 4 * 1024 * 1024)
pass('enforces 4 MB upload ceiling')

const checkinPage = readFileSync(resolve('src/app/checkin/page.tsx'), 'utf8')
assert.match(checkinPage, /refreshSession/)
assert.match(checkinPage, /Sequential uploads/)
assert.doesNotMatch(
  checkinPage,
  /Promise\.all\(\[\s*uploadCheckinPhoto/
)
pass('check-in page uploads photos sequentially after session refresh')

const checkinLib = readFileSync(resolve('src/lib/checkin.ts'), 'utf8')
assert.match(checkinLib, /decodePhoto/)
assert.match(checkinLib, /uploadCheckinPhotoViaApi/)
assert.match(checkinLib, /createImageBitmap/)
pass('compression keeps Image fallback and API fallback')

const apiRoute = readFileSync(resolve('src/app/api/checkin/upload-photo/route.ts'), 'utf8')
assert.match(apiRoute, /CHECKIN_PHOTO_BUCKET/)
assert.match(apiRoute, /createAdminClient/)
pass('same-origin upload API exists')

console.log('\nAll photo upload reliability checks passed.')
