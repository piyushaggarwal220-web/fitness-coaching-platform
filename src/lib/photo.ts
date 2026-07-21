export const MAX_PHOTO_FILE_SIZE_BYTES = 20 * 1024 * 1024
export const MAX_PHOTO_FILE_SIZE_LABEL = '20 MB'

export const ACCEPTED_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const PHOTO_INPUT_ACCEPT = ACCEPTED_PHOTO_MIME_TYPES.join(',')

export function validatePhotoFile(file: File): string | null {
  const mimeType = file.type.toLowerCase()
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  const hasAcceptedMime = ACCEPTED_PHOTO_MIME_TYPES.includes(
    mimeType as (typeof ACCEPTED_PHOTO_MIME_TYPES)[number]
  )
  const hasAcceptedUntypedExtension =
    mimeType === '' && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension)

  if (!hasAcceptedMime && !hasAcceptedUntypedExtension) {
    return `${file.name || 'This file'} is not a supported photo. Choose a JPEG, PNG, WebP, HEIC, or HEIF image.`
  }
  if (file.size > MAX_PHOTO_FILE_SIZE_BYTES) {
    return `${file.name || 'This photo'} is larger than ${MAX_PHOTO_FILE_SIZE_LABEL}. Choose a smaller photo.`
  }
  return null
}

export function validatePhotoFiles(files: readonly File[]): string | null {
  for (const file of files) {
    const error = validatePhotoFile(file)
    if (error) return error
  }
  return null
}
