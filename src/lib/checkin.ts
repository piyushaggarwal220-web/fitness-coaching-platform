import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CheckinFormData,
  CoachCheckinResponse,
  MidWeekCheckinFormData,
  WeeklyCheckinFormData,
} from '@/types/database'
import { validatePhotoFile } from '@/lib/photo'

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
  energy_level: '',
  sleep_quality: '',
  stress_level: '',
  hunger_level: '',
  pain_injuries: '',
  questions_for_coach: '',
  additional_comments: '',
}

export const INITIAL_WEEKLY_FORM: WeeklyCheckinFormData = {
  weight: '',
  diet_adherence: '',
  workout_adherence: '',
  energy_level: '',
  sleep_quality: '',
  stress_level: '',
  hunger_level: '',
  motivation_level: '',
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
  return null
}

export function validateWeeklyCheckinForm(
  data: WeeklyCheckinFormData,
  photos: { front: File | null; side: File | null; back: File | null }
): string | null {
  if (!data.weight || Number(data.weight) <= 0) return 'Enter a valid weight in kg.'
  if (!isScoreValid(data.diet_adherence)) return 'Diet adherence must be between 1 and 10.'
  if (!isScoreValid(data.workout_adherence)) return 'Workout adherence must be between 1 and 10.'
  if (!isScoreValid(data.energy_level)) return 'Energy must be between 1 and 10.'
  if (!isScoreValid(data.sleep_quality)) return 'Sleep must be between 1 and 10.'
  if (!isScoreValid(data.stress_level)) return 'Stress must be between 1 and 10.'
  if (!isScoreValid(data.hunger_level)) return 'Hunger must be between 1 and 10.'
  if (!isScoreValid(data.motivation_level)) return 'Motivation must be between 1 and 10.'
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

/** Compress image client-side before upload. Falls back to original on failure. */
export async function compressImageFile(file: File): Promise<File> {
  const validationError = validatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', PHOTO_JPEG_QUALITY)
    })

    if (!blob) return file
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
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
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${clientId}/${Date.now()}_${label}.${ext}`

  const { error } = await supabase.storage
    .from(CHECKIN_PHOTO_BUCKET)
    .upload(path, compressed, { upsert: false, contentType: compressed.type || 'image/jpeg' })

  if (error) throw new Error(`Photo upload failed (${label}): ${error.message}`)

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
