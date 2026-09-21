/**
 * Quick unit check for gallery → progress photo fallback.
 *   npx tsx scripts/verify-progress-photo-gallery-fallback.ts
 */
import assert from 'node:assert/strict'
import { resolveProgressPhotoRefs, savedPhotoUrlsFromProfile } from '../src/lib/onboarding'
import type { OnboardingProfile } from '../src/types/database'

const base = {
  progress_photo_front: null,
  progress_photo_side: null,
  progress_photo_back: null,
  profile_gallery_paths: [
    'user/gallery/1.jpeg',
    'user/gallery/2.jpeg',
    'user/gallery/3.jpeg',
  ],
} as Pick<
  OnboardingProfile,
  'progress_photo_front' | 'progress_photo_side' | 'progress_photo_back' | 'profile_gallery_paths'
>

const refs = resolveProgressPhotoRefs(base)
assert.equal(refs.front?.path, 'user/gallery/1.jpeg')
assert.equal(refs.front?.bucket, 'avatars')
assert.equal(refs.side?.path, 'user/gallery/2.jpeg')
assert.equal(refs.back?.path, 'user/gallery/3.jpeg')

const urls = savedPhotoUrlsFromProfile(base)
assert.equal(urls.front, 'user/gallery/1.jpeg')
assert.equal(urls.side, 'user/gallery/2.jpeg')
assert.equal(urls.back, 'user/gallery/3.jpeg')

const preferred = resolveProgressPhotoRefs({
  ...base,
  progress_photo_front: 'user/1_front.jpg',
  progress_photo_side: 'user/1_side.jpg',
  progress_photo_back: 'user/1_back.jpg',
})
assert.equal(preferred.front?.bucket, 'onboarding-photos')
assert.equal(preferred.front?.path, 'user/1_front.jpg')

console.log('✓ gallery progress-photo fallback ok')
