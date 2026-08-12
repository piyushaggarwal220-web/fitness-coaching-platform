/**
 * Verifies onboarding photo upload reliability helpers.
 * Run: npx tsx scripts/verify-onboarding-photo-upload.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  emptySavedPhotoUrls,
  mergeSavedPhotoUrls,
} from '../src/lib/onboarding'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

assert.deepEqual(
  mergeSavedPhotoUrls(emptySavedPhotoUrls(), { front: 'a.jpg' }),
  { front: 'a.jpg', side: null, back: null }
)
assert.deepEqual(
  mergeSavedPhotoUrls({ front: 'a.jpg', side: null, back: null }, { side: 'b.jpg' }),
  { front: 'a.jpg', side: 'b.jpg', back: null }
)
assert.deepEqual(
  mergeSavedPhotoUrls({ front: 'a.jpg', side: 'b.jpg', back: null }, { front: null as unknown as string }),
  { front: 'a.jpg', side: 'b.jpg', back: null },
  'null patch values must not wipe existing uploads'
)
pass('mergeSavedPhotoUrls keeps earlier uploads when a later slot saves')

const onboardingLib = readFileSync(resolve('src/lib/onboarding.ts'), 'utf8')
assert.match(onboardingLib, /uploadOnboardingPhotoViaApi/)
assert.match(onboardingLib, /isNetworkPhotoUploadError/)
assert.match(onboardingLib, /onboarding_wizard_draft_v2/)
assert.match(onboardingLib, /photoUrls\?:/)
pass('onboarding photo upload has same-origin fallback + draft photo paths')

const onboardingPage = readFileSync(resolve('src/app/onboarding/page.tsx'), 'utf8')
assert.match(onboardingPage, /mergeSavedPhotoUrls\(stateRef\.current\.photoUrls/)
assert.match(onboardingPage, /progress_photo_front, progress_photo_side, progress_photo_back/)
assert.match(onboardingPage, /photoSlotErrors/)
pass('onboarding page merges live photo refs and rechecks profile before blocking Continue')

const apiRoute = readFileSync(resolve('src/app/api/onboarding/upload-photo/route.ts'), 'utf8')
assert.match(apiRoute, /ONBOARDING_PHOTO_BUCKET/)
assert.match(apiRoute, /createAdminClient/)
assert.match(apiRoute, /\(front\|side\|back\)/)
pass('same-origin onboarding upload API exists')

console.log('\nAll onboarding photo upload reliability checks passed.')
