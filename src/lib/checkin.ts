import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CheckinFormData,
  CoachCheckinResponse,
  MidWeekCheckinFormData,
  WeeklyCheckinFormData,
} from '@/types/database'
import {
  convertHeicFileToJpeg,
  isHeicLike,
  isVisionSafeMediaType,
  validatePhotoFile,
} from '@/lib/photo'
import {
  MAX_STANDARD_PHOTO_UPLOAD_BYTES,
  MAX_STANDARD_PHOTO_UPLOAD_LABEL,
  isNetworkPhotoUploadError,
  uploadStandardPhoto,
} from '@/lib/photo-upload'

export const CHECKIN_PHOTO_BUCKET = 'checkin-photos'
export const CHECKIN_INTERVAL_DAYS = 7
export const MAX_PHOTO_DIMENSION = 1600
export const PHOTO_JPEG_QUALITY = 0.82

export const INITIAL_CHECKIN_FORM: CheckinFormData = {
  weight: '',
  waist: '',
  energy_level: '',
  hunger_level: '',
  training_performance: '',
  adherence_score: '',
  notes: '',
}

export const INITIAL_MID_WEEK_FORM: MidWeekCheckinFormData = {
  diet_adherence: '',
  workout_adherence: '',
  days_followed_diet: '2',
  days_followed_workout: '2',
  days_followed_sleep: '2',
  days_followed_water: '2',
  days_followed_steps: '2',
  energy_level: '',
  sleep_quality: '',
  stress_level: '',
  hunger_level: '',
  adherence_wins: '',
  adherence_struggles: '',
  pain_injuries: '',
  questions_for_coach: '',
  additional_comments: '',
}

export const INITIAL_WEEKLY_FORM: WeeklyCheckinFormData = {
  weight: '',
  chest: '',
  thigh: '',
  navel: '',
  diet_adherence: '',
  workout_adherence: '',
  days_followed_diet: '4',
  days_followed_workout: '4',
  days_followed_sleep: '4',
  days_followed_water: '4',
  days_followed_steps: '4',
  energy_level: '',
  sleep_quality: '',
  stress_level: '',
  hunger_level: '',
  motivation_level: '',
  progress_rating: '',
  progress_notes: '',
  digestion: '',
  pain_injuries: '',
  cardio_completed: '',
  additional_notes: '',
}

function isScoreValid(value: string): boolean {
  const n = Number(value)
  return !Number.isNaN(n) && n >= 1 && n <= 10
}

function isDaysValid(value: string, max: number): boolean {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= max
}

export function validateMidWeekForm(data: MidWeekCheckinFormData): string | null {
  if (!isScoreValid(data.diet_adherence)) return 'Diet adherence must be between 1 and 10.'
  if (!isScoreValid(data.workout_adherence)) return 'Workout adherence must be between 1 and 10.'
  if (!isDaysValid(data.days_followed_diet, 3)) return 'How many of the last 3 days did you follow the diet? (0–3)'
  if (!isDaysValid(data.days_followed_workout, 3)) return 'How many of the last 3 days did you train? (0–3)'
  if (!isDaysValid(data.days_followed_sleep, 3)) return 'How many of the last 3 days did you sleep well? (0–3)'
  if (!isDaysValid(data.days_followed_water, 3)) return 'How many of the last 3 days did you hit your water? (0–3)'
  if (!isDaysValid(data.days_followed_steps, 3)) return 'How many of the last 3 days did you hit your steps? (0–3)'
  if (!isScoreValid(data.energy_level)) return 'Energy must be between 1 and 10.'
  if (!isScoreValid(data.sleep_quality)) return 'Sleep quality must be between 1 and 10.'
  if (!isScoreValid(data.stress_level)) return 'Stress must be between 1 and 10.'
  if (!isScoreValid(data.hunger_level)) return 'Hunger must be between 1 and 10.'
  if (!data.adherence_wins.trim()) return 'Tell us what is helping you stick to the plan.'
  if (!data.adherence_struggles.trim()) return 'Tell us where adherence slipped this week.'
  return null
}

export function validateWeeklyCheckinForm(
  data: WeeklyCheckinFormData,
  photos: { front: File | null; side: File | null; back: File | null },
  options?: { gender?: string | null }
): string | null {
  if (!data.weight || Number(data.weight) <= 0) return 'Scroll to select your weight.'
  if (!data.chest || Number(data.chest) <= 0) return 'Scroll to select your chest measurement.'
  if (!data.thigh || Number(data.thigh) <= 0) return 'Scroll to select your thigh measurement.'
  if (!data.navel || Number(data.navel) <= 0) return 'Scroll to select your belly (navel) measurement.'
  if (!isScoreValid(data.diet_adherence)) return 'Diet adherence must be between 1 and 10.'
  if (!isScoreValid(data.workout_adherence)) return 'Workout adherence must be between 1 and 10.'
  if (!isDaysValid(data.days_followed_diet, 7)) return 'How many of the last 7 days did you follow the diet? (0–7)'
  if (!isDaysValid(data.days_followed_workout, 7)) return 'How many of the last 7 days did you train? (0–7)'
  if (!isDaysValid(data.days_followed_sleep, 7)) return 'How many of the last 7 days did you sleep well? (0–7)'
  if (!isDaysValid(data.days_followed_water, 7)) return 'How many of the last 7 days did you hit your water? (0–7)'
  if (!isDaysValid(data.days_followed_steps, 7)) return 'How many of the last 7 days did you hit your steps? (0–7)'
  if (!isScoreValid(data.energy_level)) return 'Energy must be between 1 and 10.'
  if (!isScoreValid(data.sleep_quality)) return 'Sleep must be between 1 and 10.'
  if (!isScoreValid(data.stress_level)) return 'Stress must be between 1 and 10.'
  if (!isScoreValid(data.hunger_level)) return 'Hunger must be between 1 and 10.'
  if (!isScoreValid(data.motivation_level)) return 'Motivation must be between 1 and 10.'
  if (!isScoreValid(data.progress_rating)) return 'Rate your progress between 1 and 10.'
  if (!data.progress_notes.trim()) return 'Describe your progress compared to last week.'
  // Match onboarding: photos are optional for female clients
  if (options?.gender === 'female') return null
  if (!photos.front) return 'Front progress photo is required.'
  if (!photos.side) return 'Side progress photo is required.'
  if (!photos.back) return 'Back progress photo is required.'
  return null
}

/** @deprecated Use validateWeeklyCheckinForm */
export function validateCheckinForm(
  data: CheckinFormData,
  photos: { front: File | null; side: File | null; back: File | null }
): string | null {
  if (!data.weight || Number(data.weight) <= 0) return 'Enter a valid weight in kg.'
  if (!data.waist || Number(data.waist) <= 0) return 'Enter a valid waist measurement in cm.'
  if (!isScoreValid(data.energy_level)) return 'Energy level must be between 1 and 10.'
  if (!isScoreValid(data.hunger_level)) return 'Hunger level must be between 1 and 10.'
  if (!isScoreValid(data.training_performance)) return 'Training performance must be between 1 and 10.'
  if (!isScoreValid(data.adherence_score)) return 'Adherence score must be between 1 and 10.'
  if (!photos.front) return 'Front progress photo is required.'
  if (!photos.side) return 'Side progress photo is required.'
  if (!photos.back) return 'Back progress photo is required.'
  return null
}

type DecodedPhoto = {
  source: CanvasImageSource
  width: number
  height: number
  close?: () => void
}

async function decodePhoto(file: File): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      }
    } catch {
      // Some Android browsers decode camera/gallery images via <img> only.
    }
  }

  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot decode the selected photo.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The selected photo could not be decoded.'))
      image.src = objectUrl
    })
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function canvasCompressToJpeg(file: File, quality = PHOTO_JPEG_QUALITY): Promise<File | null> {
  try {
    const decoded = await decodePhoto(file)
    try {
      const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(decoded.width, decoded.height))
      const width = Math.max(1, Math.round(decoded.width * scale))
      const height = Math.max(1, Math.round(decoded.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      ctx.drawImage(decoded.source, 0, 0, width, height)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      })
      if (!blob) return null
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
    } finally {
      decoded.close?.()
    }
  } catch {
    return null
  }
}

/**
 * Normalize photos to JPEG before upload.
 * HEIC/HEIF (common on iPhone gallery picks) is converted so AI vision can process them.
 * Never silently upload an unreadable HEIC original or a huge uncompressed PNG.
 */
export async function compressImageFile(file: File): Promise<File> {
  const validationError = validatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  let working = file
  if (isHeicLike(file)) {
    try {
      working = await convertHeicFileToJpeg(file, PHOTO_JPEG_QUALITY)
    } catch {
      // Some browsers can decode HEIC via createImageBitmap / <img>; try that next.
    }
  }

  let compressed = await canvasCompressToJpeg(working, PHOTO_JPEG_QUALITY)
  if (compressed && compressed.size > MAX_STANDARD_PHOTO_UPLOAD_BYTES) {
    compressed = await canvasCompressToJpeg(working, 0.7)
  }
  if (compressed && isVisionSafeMediaType(compressed.type)) {
    if (compressed.size > MAX_STANDARD_PHOTO_UPLOAD_BYTES) {
      throw new Error(
        `${file.name || 'This photo'} is still too large after compression ` +
          `(max ${MAX_STANDARD_PHOTO_UPLOAD_LABEL}). Use “Take photo now” or choose a smaller image.`
      )
    }
    return compressed
  }

  // Only keep the original when it is already small enough for reliable mobile upload.
  if (
    isVisionSafeMediaType(working.type) &&
    !isHeicLike(working) &&
    working.size <= MAX_STANDARD_PHOTO_UPLOAD_BYTES
  ) {
    return working
  }

  throw new Error(
    `${file.name || 'This photo'} could not be processed. Use “Take photo now”, or choose a JPEG/PNG from your gallery, then try again.`
  )
}

/** Retry transient storage failures (network blips) without masking RLS / size errors. */
export async function uploadPhotoWithRetry(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  label: string
): Promise<void> {
  await uploadStandardPhoto(supabase, bucket, path, file, label)
}

async function uploadCheckinPhotoViaApi(file: File, label: string): Promise<string> {
  const body = new FormData()
  body.append('file', file, file.name || `${label}.jpg`)
  body.append('label', label)

  const res = await fetch('/api/checkin/upload-photo', {
    method: 'POST',
    body,
    credentials: 'include',
  })

  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string }
  if (!res.ok || !data.path) {
    throw new Error(data.error || `Photo upload failed (${label}): server upload failed.`)
  }
  return data.path
}

export async function uploadCheckinPhoto(
  supabase: SupabaseClient,
  clientId: string,
  file: File,
  label: string
): Promise<string> {
  const validationError = validatePhotoFile(file)
  if (validationError) throw new Error(validationError)
  const compressed = typeof window !== 'undefined' ? await compressImageFile(file) : file
  if (!isVisionSafeMediaType(compressed.type) && isHeicLike(compressed)) {
    throw new Error(
      `Photo upload failed (${label}): iPhone HEIC photos must be converted first. Use “Take photo now” or pick a JPEG/PNG.`
    )
  }
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${clientId}/${Date.now()}_${label}.${ext}`

  try {
    await uploadPhotoWithRetry(supabase, CHECKIN_PHOTO_BUCKET, path, compressed, label)
    return path
  } catch (error) {
    // Mobile networks often fail browser→Supabase Storage; same-origin API is more reliable.
    if (typeof window !== 'undefined' && isNetworkPhotoUploadError(error)) {
      return uploadCheckinPhotoViaApi(compressed, label)
    }
    throw error
  }
}

export function parseCoachResponse(raw: string | null): CoachCheckinResponse {
  if (!raw) return { feedback: '', action_items: '' }
  try {
    const parsed = JSON.parse(raw) as CoachCheckinResponse
    return {
      feedback: parsed.feedback ?? '',
      action_items: parsed.action_items ?? '',
    }
  } catch {
    return { feedback: raw, action_items: '' }
  }
}

export function serializeCoachResponse(response: CoachCheckinResponse): string {
  return JSON.stringify(response)
}

export function formatCheckinDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function getNextCheckinDate(lastSubmittedAt: string | null): Date {
  const base = lastSubmittedAt ? new Date(lastSubmittedAt) : new Date()
  const next = new Date(base)
  next.setDate(next.getDate() + CHECKIN_INTERVAL_DAYS)
  return next
}

export function isCheckinDue(lastSubmittedAt: string | null): boolean {
  if (!lastSubmittedAt) return true
  const next = getNextCheckinDate(lastSubmittedAt)
  return new Date() >= next
}

export function formatWeightChange(current: number | null, previous: number | null): string {
  if (current == null) return '—'
  if (previous == null) return `${current} kg (first check-in)`
  const diff = current - previous
  const sign = diff > 0 ? '+' : ''
  return `${current} kg (${sign}${diff.toFixed(1)} kg)`
}

export function formatWaistChange(current: number | null, previous: number | null): string {
  if (current == null) return '—'
  if (previous == null) return `${current} cm (first check-in)`
  const diff = current - previous
  const sign = diff > 0 ? '+' : ''
  return `${current} cm (${sign}${diff.toFixed(1)} cm)`
}
