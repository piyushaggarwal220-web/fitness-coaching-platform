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

export const CHECKIN_PHOTO_BUCKET = 'checkin-photos'
export const CHECKIN_INTERVAL_DAYS = 7
export const MAX_PHOTO_DIMENSION = 1600
export const PHOTO_JPEG_QUALITY = 0.82
const PHOTO_UPLOAD_ATTEMPTS = 3

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

export function validateMidWeekForm(data: MidWeekCheckinFormData): string | null {
  if (!isScoreValid(data.diet_adherence)) return 'Diet adherence must be between 1 and 10.'
  if (!isScoreValid(data.workout_adherence)) return 'Workout adherence must be between 1 and 10.'
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
  photos: { front: File | null; side: File | null; back: File | null }
): string | null {
  if (!data.weight || Number(data.weight) <= 0) return 'Scroll to select your weight.'
  if (!data.chest || Number(data.chest) <= 0) return 'Scroll to select your chest measurement.'
  if (!data.thigh || Number(data.thigh) <= 0) return 'Scroll to select your thigh measurement.'
  if (!data.navel || Number(data.navel) <= 0) return 'Scroll to select your belly (navel) measurement.'
  if (!isScoreValid(data.diet_adherence)) return 'Diet adherence must be between 1 and 10.'
  if (!isScoreValid(data.workout_adherence)) return 'Workout adherence must be between 1 and 10.'
  if (!isScoreValid(data.energy_level)) return 'Energy must be between 1 and 10.'
  if (!isScoreValid(data.sleep_quality)) return 'Sleep must be between 1 and 10.'
  if (!isScoreValid(data.stress_level)) return 'Stress must be between 1 and 10.'
  if (!isScoreValid(data.hunger_level)) return 'Hunger must be between 1 and 10.'
  if (!isScoreValid(data.motivation_level)) return 'Motivation must be between 1 and 10.'
  if (!isScoreValid(data.progress_rating)) return 'Rate your progress between 1 and 10.'
  if (!data.progress_notes.trim()) return 'Describe your progress compared to last week.'
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

async function canvasCompressToJpeg(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', PHOTO_JPEG_QUALITY)
    })
    if (!blob) return null
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } catch {
    return null
  }
}

/**
 * Normalize photos to JPEG before upload.
 * HEIC/HEIF (common on iPhone gallery picks) is converted so AI vision can process them.
 * Never silently upload an unreadable HEIC original.
 */
export async function compressImageFile(file: File): Promise<File> {
  const validationError = validatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  let working = file
  if (isHeicLike(file)) {
    try {
      working = await convertHeicFileToJpeg(file, PHOTO_JPEG_QUALITY)
    } catch {
      // Some browsers can decode HEIC via createImageBitmap; try that next.
    }
  }

  const compressed = await canvasCompressToJpeg(working)
  if (compressed && isVisionSafeMediaType(compressed.type)) return compressed

  if (isVisionSafeMediaType(working.type) && !isHeicLike(working)) {
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
  let lastError: Error | null = null
  for (let attempt = 0; attempt < PHOTO_UPLOAD_ATTEMPTS; attempt++) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
    if (!error) return
    lastError = new Error(`Photo upload failed (${label}): ${error.message}`)
    // Do not retry permanent client errors
    if (/duplicate|already exists|payload too large|not allowed|row-level security/i.test(error.message)) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
  }
  throw lastError ?? new Error(`Photo upload failed (${label}).`)
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

  await uploadPhotoWithRetry(supabase, CHECKIN_PHOTO_BUCKET, path, compressed, label)

  // Store object path; display via signed URLs (bucket is private).
  return path
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
