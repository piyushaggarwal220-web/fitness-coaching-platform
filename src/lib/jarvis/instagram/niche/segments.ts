/**
 * Niche segments + observation windows. India vs Global never silently mixed.
 */

import type { FitnessNiche, GeographyScope, ObservationWindowHours } from '@/lib/jarvis/instagram/niche/types'

export const FITNESS_NICHES: FitnessNiche[] = [
  'GENERAL_FITNESS',
  'FAT_LOSS',
  'MUSCLE_GAIN',
  'BODYBUILDING',
  'NATURAL_BODYBUILDING',
  'BEGINNER_FITNESS',
  'NUTRITION',
  'CARDIO',
  'HOME_FITNESS',
  'GYM_TRAINING',
  'TRANSFORMATION',
  'ATHLETIC_PERFORMANCE',
  'FITNESS_MYTHS',
  'SUPPLEMENTS',
]

export function inferNiche(text: string): FitnessNiche {
  const t = text.toLowerCase()
  if (/fat.?loss|weight.?loss|belly fat|cutting/.test(t)) return 'FAT_LOSS'
  if (/muscle|hypertrophy|bulk/.test(t)) return 'MUSCLE_GAIN'
  if (/natural bodybuild/.test(t)) return 'NATURAL_BODYBUILDING'
  if (/bodybuild/.test(t)) return 'BODYBUILDING'
  if (/protein|calorie|diet|nutrition|meal/.test(t)) return 'NUTRITION'
  if (/beginner|newbie|start/.test(t)) return 'BEGINNER_FITNESS'
  if (/cardio|hiit|running/.test(t)) return 'CARDIO'
  if (/home.?workout|no.?equipment/.test(t)) return 'HOME_FITNESS'
  if (/gym|form check|lift/.test(t)) return 'GYM_TRAINING'
  if (/transform/.test(t)) return 'TRANSFORMATION'
  if (/myth|debunk/.test(t)) return 'FITNESS_MYTHS'
  if (/supplement|creatine|whey/.test(t)) return 'SUPPLEMENTS'
  if (/athlete|performance|sport/.test(t)) return 'ATHLETIC_PERFORMANCE'
  return 'GENERAL_FITNESS'
}

export function inferGeography(text: string): GeographyScope {
  const t = text.toLowerCase()
  if (/\bindia\b|indian|mumbai|delhi|bangalore|bengaluru|hyderabad|₹|rupee|desi/.test(t)) {
    return 'INDIA'
  }
  if (/\b(global|worldwide|us\b|usa|uk\b|europe)\b/.test(t)) return 'GLOBAL'
  return 'UNKNOWN'
}

export function windowHoursFromLabel(label: string): ObservationWindowHours {
  const t = label.toLowerCase()
  if (/24\s*h|today|right now|last day/.test(t)) return 24
  if (/90\s*d|quarter|3\s*month/.test(t)) return 2160
  if (/30\s*d|month/.test(t)) return 720
  return 168 // default 7 days
}

export function windowLabel(hours: number): string {
  if (hours <= 24) return '24 hours'
  if (hours <= 168) return '7 days'
  if (hours <= 720) return '30 days'
  return '90 days'
}

export function geographySignalLabel(
  geo: GeographyScope
): 'INDIA_SIGNAL' | 'GLOBAL_SIGNAL' | 'MIXED_LABELED' {
  if (geo === 'INDIA') return 'INDIA_SIGNAL'
  if (geo === 'GLOBAL') return 'GLOBAL_SIGNAL'
  return 'MIXED_LABELED'
}
