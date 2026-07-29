import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadCheckinPhoto } from '../src/lib/checkin'
import {
  uploadPendingOnboardingPhotos,
  type OnboardingPhotoFiles,
  type SavedPhotoUrls,
} from '../src/lib/onboarding'
import {
  MAX_STANDARD_PHOTO_UPLOAD_BYTES,
  isRetryablePhotoUploadError,
  uploadStandardPhoto,
} from '../src/lib/photo-upload'
import { DEFAULT_COACH_HARD_CAP, resolveCoachHardCap } from '../src/lib/coach-capacity'

type Step =
  | { error: Error | null }
  | { throws: Error }

function storageError(
  name: 'StorageApiError' | 'StorageUnknownError',
  message: string,
  status?: number,
  statusCode?: string
): Error {
  return Object.assign(new Error(message), { name, status, statusCode })
}

function storageClient(steps: Step[]) {
  const paths: string[] = []
  const client = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          paths.push(path)
          const step = steps[Math.min(paths.length - 1, steps.length - 1)]
          if ('throws' in step) throw step.throws
          return step
        },
      }),
    },
  } as unknown as SupabaseClient
  return { client, paths }
}

function photo(name: string, size = 128): File {
  return new File([new Uint8Array(size)], name, { type: 'image/jpeg' })
}

function labelFromPath(path: string): string | undefined {
  return path.match(/_(front|side|back)\./)?.[1]
}

async function main() {
  assert.equal(resolveCoachHardCap(null), DEFAULT_COACH_HARD_CAP)
  assert.equal(resolveCoachHardCap(undefined), 1000)
  assert.equal(resolveCoachHardCap(500), 500)
  assert.equal(resolveCoachHardCap(1000), 1000)
  console.log('✓ Coach capacity defaults to 1000 when unset')

  const networkError = storageError('StorageUnknownError', 'Failed to fetch')
  const policyError = storageError(
    'StorageApiError',
    'new row violates row-level security policy',
    403,
    '403'
  )
  const serverError = storageError('StorageApiError', 'Storage service unavailable', 503, '503')
  const rateLimitError = storageError('StorageApiError', 'Too many requests', 429, '429')
  const duplicateError = storageError(
    'StorageApiError',
    'The resource already exists',
    400,
    'Duplicate'
  )

  assert.equal(isRetryablePhotoUploadError(networkError), true)
  assert.equal(isRetryablePhotoUploadError(serverError), true)
  assert.equal(isRetryablePhotoUploadError(rateLimitError), true)
  assert.equal(isRetryablePhotoUploadError(policyError), false)
  console.log('✓ Network, rate-limit, and 5xx failures retry; policy failures do not')

  const transient = storageClient([{ error: networkError }, { error: null }])
  const transientPath = await uploadCheckinPhoto(
    transient.client,
    'client',
    photo('photo.jpg'),
    'front'
  )
  assert.equal(transientPath, transient.paths[0])
  assert.equal(transient.paths.length, 2)
  console.log('✓ A transient StorageUnknownError succeeds on retry')

  const policy = storageClient([{ error: policyError }, { error: null }])
  await assert.rejects(
    uploadCheckinPhoto(policy.client, 'client', photo('photo.jpg'), 'front'),
    /row-level security/
  )
  assert.equal(policy.paths.length, 1)
  console.log('✓ A 403 policy error is returned after one attempt')

  const acceptedThenDisconnected = storageClient([
    { error: networkError },
    { error: duplicateError },
  ])
  assert.equal(
    await uploadStandardPhoto(
      acceptedThenDisconnected.client,
      'photos',
      'client/idempotent.jpg',
      photo('photo.jpg'),
      'front'
    ),
    'client/idempotent.jpg'
  )
  assert.equal(acceptedThenDisconnected.paths.length, 2)
  console.log('✓ A duplicate after a transient failure is treated as an accepted first attempt')

  const oversized = storageClient([{ error: null }])
  await assert.rejects(
    uploadStandardPhoto(
      oversized.client,
      'photos',
      'client/large.jpg',
      photo('large.jpg', MAX_STANDARD_PHOTO_UPLOAD_BYTES + 1),
      'back'
    ),
    /maximum 6 MB/
  )
  assert.equal(oversized.paths.length, 0)
  console.log('✓ Files over 6 MB after processing fail before a standard upload')

  const onboarding = storageClient([
    { error: null },
    { error: null },
    { error: networkError },
    { error: networkError },
    { error: networkError },
    { error: null },
  ])
  let pending: OnboardingPhotoFiles = {
    front: photo('front.jpg'),
    side: photo('side.jpg'),
    back: photo('back.jpg'),
  }
  let saved: SavedPhotoUrls = { front: null, side: null, back: null }
  const retainUpload = (
    label: keyof OnboardingPhotoFiles,
    _path: string,
    uploadedUrls: SavedPhotoUrls
  ) => {
    pending = { ...pending, [label]: null }
    saved = uploadedUrls
  }

  await assert.rejects(
    uploadPendingOnboardingPhotos(onboarding.client, 'client', pending, saved, retainUpload),
    /Failed to fetch/
  )
  assert.ok(saved.front)
  assert.ok(saved.side)
  assert.equal(saved.back, null)
  assert.equal(pending.front, null)
  assert.equal(pending.side, null)
  assert.ok(pending.back)

  saved = await uploadPendingOnboardingPhotos(
    onboarding.client,
    'client',
    pending,
    saved,
    retainUpload
  )
  assert.ok(saved.back)
  assert.deepEqual(onboarding.paths.map(labelFromPath), [
    'front',
    'side',
    'back',
    'back',
    'back',
    'back',
  ])
  console.log('✓ Retrying onboarding after a back failure does not re-upload front or side')

  const onboardingPage = await readFile('src/app/onboarding/page.tsx', 'utf8')
  assert.match(
    onboardingPage,
    /uploadPendingOnboardingPhotos\([\s\S]*setPhotos\([\s\S]*step,\s+photoUrls: uploadedUrls/
  )
  console.log('✓ The onboarding page retains each photo without advancing past an incomplete step')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
