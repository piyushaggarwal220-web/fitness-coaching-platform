import type { SupabaseClient } from '@supabase/supabase-js'
import type { CheckinFormData, CoachCheckinResponse } from '@/types/database'

export const CHECKIN_PHOTO_BUCKET = 'checkin-photos'
export const CHECKIN_INTERVAL_DAYS = 7

export const INITIAL_CHECKIN_FORM: CheckinFormData = {
  weight: '',
  waist: '',
  energy_level: '',
  hunger_level: '',
  training_performance: '',
  adherence_score: '',
  notes: '',
}

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

function isScoreValid(value: string): boolean {
  const n = Number(value)
  return !Number.isNaN(n) && n >= 1 && n <= 10
}

export async function uploadCheckinPhoto(
  supabase: SupabaseClient,
  clientId: string,
  file: File,
  label: 'front' | 'side' | 'back'
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${clientId}/${Date.now()}_${label}.${ext}`

  const { error } = await supabase.storage
    .from(CHECKIN_PHOTO_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })

  if (error) throw new Error(`Photo upload failed (${label}): ${error.message}`)

  const { data } = supabase.storage.from(CHECKIN_PHOTO_BUCKET).getPublicUrl(path)
  return data.publicUrl
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
