import { importWithChunkRetry } from '@/lib/chunk-load-recovery'

export const MAX_PHOTO_FILE_SIZE_BYTES = 20 * 1024 * 1024
export const MAX_PHOTO_FILE_SIZE_LABEL = '20 MB'

export const ACCEPTED_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

/** Formats Anthropic vision / plan generation can consume. */
export const VISION_SAFE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

export type VisionSafeMediaType = (typeof VISION_SAFE_MEDIA_TYPES)[number]

export const PHOTO_INPUT_ACCEPT = ACCEPTED_PHOTO_MIME_TYPES.join(',')

const HEIC_EXTENSIONS = new Set(['heic', 'heif'])
const VISION_SAFE_EXTENSIONS: Record<string, VisionSafeMediaType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

export function getFileExtension(name: string | null | undefined): string {
  return name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
}

export function isHeicLike(file: { type?: string | null; name?: string | null }): boolean {
  const mime = (file.type ?? '').toLowerCase()
  if (mime === 'image/heic' || mime === 'image/heif') return true
  return HEIC_EXTENSIONS.has(getFileExtension(file.name))
}

export function isVisionSafeMediaType(mediaType: string | null | undefined): mediaType is VisionSafeMediaType {
  return Boolean(mediaType && (VISION_SAFE_MEDIA_TYPES as readonly string[]).includes(mediaType))
}

/** Detect image MIME from magic bytes (Supabase Blob.type is often empty). */
export function sniffImageMediaType(
  bytes: ArrayBuffer | Uint8Array,
  pathOrName?: string | null
): VisionSafeMediaType | 'image/heic' | 'image/heif' | null {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    view.length >= 8 &&
    view[0] === 0x89 &&
    view[1] === 0x50 &&
    view[2] === 0x4e &&
    view[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    view.length >= 6 &&
    view[0] === 0x47 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x38
  ) {
    return 'image/gif'
  }
  if (
    view.length >= 12 &&
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x45 &&
    view[10] === 0x42 &&
    view[11] === 0x50
  ) {
    return 'image/webp'
  }
  // ISO BMFF brands used by HEIC/HEIF (ftyp....heic / heif / mif1 / msf1)
  if (view.length >= 12) {
    const brand = String.fromCharCode(view[8], view[9], view[10], view[11]).toLowerCase()
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') {
      return 'image/heic'
    }
    if (brand === 'heif' || brand === 'mif1' || brand === 'msf1') {
      return 'image/heif'
    }
    // ftyp box — scan nearby brands
    if (String.fromCharCode(view[4], view[5], view[6], view[7]) === 'ftyp') {
      const probe = String.fromCharCode(...view.slice(8, Math.min(view.length, 24))).toLowerCase()
      if (probe.includes('heic') || probe.includes('heix')) return 'image/heic'
      if (probe.includes('heif') || probe.includes('mif1')) return 'image/heif'
    }
  }

  const ext = getFileExtension(pathOrName ?? '')
  if (VISION_SAFE_EXTENSIONS[ext]) return VISION_SAFE_EXTENSIONS[ext]
  if (HEIC_EXTENSIONS.has(ext)) return ext === 'heif' ? 'image/heif' : 'image/heic'
  return null
}

export function resolveVisionMediaType(
  declaredType: string | null | undefined,
  bytes: ArrayBuffer | Uint8Array,
  pathOrName?: string | null
): VisionSafeMediaType {
  const declared = (declaredType ?? '').toLowerCase().split(';')[0]?.trim()
  if (isVisionSafeMediaType(declared)) return declared

  const sniffed = sniffImageMediaType(bytes, pathOrName)
  if (sniffed === 'image/heic' || sniffed === 'image/heif') {
    throw new Error(
      'An uploaded onboarding photo is still in HEIC/HEIF format and could not be processed. Ask the client to re-upload using the app (JPEG will be created automatically), or take a new photo with the camera button.'
    )
  }
  if (isVisionSafeMediaType(sniffed)) return sniffed

  throw new Error('An uploaded onboarding photo has an unsupported format.')
}

export function validatePhotoFile(file: File): string | null {
  const mimeType = file.type.toLowerCase()
  const extension = getFileExtension(file.name)
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

/** Convert HEIC/HEIF to JPEG in the browser so uploads are vision-safe. */
export async function convertHeicFileToJpeg(file: File, quality = 0.82): Promise<File> {
  const heic2any = (await importWithChunkRetry(() => import('heic2any'))).default
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality,
  })
  const blob = Array.isArray(converted) ? converted[0] : converted
  if (!(blob instanceof Blob)) {
    throw new Error('Could not convert this iPhone photo. Try “Take photo now” or choose a JPEG/PNG.')
  }
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}
