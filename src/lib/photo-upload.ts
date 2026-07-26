import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_STANDARD_PHOTO_UPLOAD_BYTES = 6 * 1024 * 1024
export const MAX_STANDARD_PHOTO_UPLOAD_LABEL = '6 MB'
export const PHOTO_UPLOAD_ATTEMPTS = 3
export const PHOTO_UPLOAD_RETRY_DELAYS_MS = [0, 750, 2_000] as const

type StorageFailure = {
  name?: string
  message?: string
  status?: number
  statusCode?: string
}

function storageFailure(error: unknown): StorageFailure {
  return error && typeof error === 'object' ? (error as StorageFailure) : {}
}

function storageStatus(error: unknown): number | undefined {
  const failure = storageFailure(error)
  if (typeof failure.status === 'number') return failure.status
  if (failure.statusCode && /^\d{3}$/.test(failure.statusCode)) {
    return Number(failure.statusCode)
  }
  return undefined
}

export function isRetryablePhotoUploadError(error: unknown): boolean {
  const status = storageStatus(error)
  if (status !== undefined) {
    return status === 408 || status === 429 || (status >= 500 && status < 600)
  }

  const failure = storageFailure(error)
  if (failure.name === 'StorageUnknownError') return true
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message)
}

function isDuplicateAfterRetry(error: unknown): boolean {
  const status = storageStatus(error)
  if (status !== 400 && status !== 409) return false
  const failure = storageFailure(error)
  return (
    failure.statusCode === 'Duplicate' ||
    /already exists|duplicate/i.test(failure.message ?? '')
  )
}

function uploadFailure(label: string, error: unknown): Error {
  const detail = storageFailure(error).message?.trim() || 'Unknown storage error'
  return new Error(`Photo upload failed (${label}): ${detail}`, { cause: error })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function uploadStandardPhoto(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  label: string
): Promise<string> {
  if (file.size > MAX_STANDARD_PHOTO_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(
      `Photo upload failed (${label}): the photo is ${sizeMb} MB after processing. ` +
        `Choose a smaller photo (maximum ${MAX_STANDARD_PHOTO_UPLOAD_LABEL}).`
    )
  }

  let sawTransientFailure = false
  for (let attempt = 1; attempt <= PHOTO_UPLOAD_ATTEMPTS; attempt += 1) {
    const delay = PHOTO_UPLOAD_RETRY_DELAYS_MS[attempt - 1] ?? 0
    if (delay > 0) await wait(delay)

    let error: unknown
    try {
      const result = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
      error = result.error
    } catch (caught) {
      error = caught
    }

    if (!error) return path
    if (sawTransientFailure && isDuplicateAfterRetry(error)) return path

    const retryable = isRetryablePhotoUploadError(error)
    if (!retryable || attempt === PHOTO_UPLOAD_ATTEMPTS) {
      throw uploadFailure(label, error)
    }
    sawTransientFailure = true
  }

  throw new Error(`Photo upload failed (${label}): upload attempts exhausted.`)
}
