import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CheckinFormData,
  CoachCheckinResponse,
  MidWeekCheckinFormData,
  WeeklyCheckinFormData,
} from '@/types/database'
import { validatePhotoFile } from '@/lib/photo'
import { MAX_STANDARD_PHOTO_UPLOAD_BYTES, uploadStandardPhoto } from '@/lib/photo-upload'

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
      // Some mobile browsers decode camera images through <img> but not createImageBitmap.
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
      width: image.naturalWidth,
      height: image.naturalHeight,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Compress image client-side before upload. Falls back to the original when it is already safe to upload. */
export async function compressImageFile(file: File): Promise<File> {
  const validationError = validatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  try {
    const decoded = await decodePhoto(file)
    try {
      const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(decoded.width, decoded.height))
      const width = Math.round(decoded.width * scale)
      const height = Math.round(decoded.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return file

      ctx.drawImage(decoded.source, 0, 0, width, height)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', PHOTO_JPEG_QUALITY)
      })

      if (!blob || blob.size > MAX_STANDARD_PHOTO_UPLOAD_BYTES) return file
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
    } finally {
      decoded.close?.()
    }
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

  // Store object path; display via signed URLs (bucket is private).
  return uploadStandardPhoto(supabase, CHECKIN_PHOTO_BUCKET, path, compressed, label)
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
