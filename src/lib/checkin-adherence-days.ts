import type { Checkin } from '@/types/database'

export type AdherenceDays = {
  days_followed_diet: number
  days_followed_workout: number
  days_followed_sleep: number
  days_followed_water: number
  days_followed_steps: number
}

export function clampAdherenceDays(value: unknown, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < 0 || rounded > max) return null
  return rounded
}

export function parseAdherenceDays(
  body: Partial<AdherenceDays>,
  max: number
): { days: AdherenceDays | null; error: string | null } {
  const diet = clampAdherenceDays(body.days_followed_diet, max)
  const workout = clampAdherenceDays(body.days_followed_workout, max)
  const sleep = clampAdherenceDays(body.days_followed_sleep, max)
  const water = clampAdherenceDays(body.days_followed_water, max)
  const steps = clampAdherenceDays(body.days_followed_steps, max)
  if (diet == null) return { days: null, error: `How many days did you follow the diet? (0–${max})` }
  if (workout == null) return { days: null, error: `How many days did you train? (0–${max})` }
  if (sleep == null) return { days: null, error: `How many days did you hit your sleep? (0–${max})` }
  if (water == null) return { days: null, error: `How many days did you hit your water? (0–${max})` }
  if (steps == null) return { days: null, error: `How many days did you hit your steps? (0–${max})` }
  return {
    days: {
      days_followed_diet: diet,
      days_followed_workout: workout,
      days_followed_sleep: sleep,
      days_followed_water: water,
      days_followed_steps: steps,
    },
    error: null,
  }
}

function dayHint(days: number | null | undefined, max: number, habit: string): string {
  if (days == null) return `${habit}: not reported`
  if (days <= Math.max(1, Math.floor(max * 0.4))) {
    return `${habit}: ${days}/${max} — low; simplify and give 2 to 3 practical recovery tips`
  }
  if (days < max) {
    return `${habit}: ${days}/${max} — decent; keep structure, tighten the 1 to 2 weak spots`
  }
  return `${habit}: ${days}/${max} — strong; keep the plan, add a small next-step tip`
}

export function formatAdherenceDaysForPrompt(checkin: Checkin, maxDays: number): string {
  return [
    'Days they stuck to the plan (authoritative for tips):',
    dayHint(checkin.days_followed_diet, maxDays, 'Diet'),
    dayHint(checkin.days_followed_workout, maxDays, 'Workout'),
    dayHint(checkin.days_followed_sleep, maxDays, 'Sleep'),
    dayHint(checkin.days_followed_water, maxDays, 'Water'),
    dayHint(checkin.days_followed_steps, maxDays, 'Steps'),
    'Update EVERY guidance section (diet, workout, sleep, water, steps/cardio) with tips that match those days. Low days = simpler plan + concrete how-to. High days = keep structure + polish.',
  ].join('\n')
}

export const ADHERENCE_DAYS_EMPTY = {
  days_followed_diet: '0',
  days_followed_workout: '0',
  days_followed_sleep: '0',
  days_followed_water: '0',
  days_followed_steps: '0',
}
