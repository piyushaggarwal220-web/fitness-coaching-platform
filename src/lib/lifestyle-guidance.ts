import type { SupabaseClient } from '@supabase/supabase-js'
import {
  defaultDailyStepTarget,
  extractStepCount,
  formatStepsOnlyCardio,
} from '@/lib/ai/cardio-steps'
import { encodePlanMeta, parsePlanMeta, stripPlanMeta } from '@/lib/plan-metadata'

export const SLEEP_WATER_HEADER = 'Sleep and water'

export type LifestyleGuidanceProfile = {
  sleep_duration?: string | null
  onboarding_data?: {
    lifestyle?: {
      dailySteps?: string | null
      waterIntake?: string | null
    } | null
  } | null
}

export type LifestyleGuidancePlan = {
  cardio_plan?: string | null
  coach_notes?: string | null
  nutrition_plan?: string | null
  workout_plan?: string | null
}

export function defaultWaterLiters(habit: string | null | undefined): number {
  const raw = String(habit ?? '').trim().toLowerCase()
  if (!raw) return 3
  if (raw === 'under_1l' || raw.includes('under_1') || raw.includes('under 1')) return 2
  if (raw === '1_2l' || raw.includes('1_2') || raw.includes('1–2') || raw.includes('1-2')) return 2.5
  if (raw === '2_3l' || raw.includes('2_3') || raw.includes('2–3') || raw.includes('2-3')) return 3
  if (raw === 'over_3l' || raw.includes('over_3') || raw.includes('3 l+') || raw.includes('3+')) return 3.5
  const liters = raw.match(/(\d+(?:\.\d+)?)\s*l/)
  if (liters) {
    const n = Number(liters[1])
    if (Number.isFinite(n) && n >= 1 && n <= 6) return Math.min(4, Math.max(2, n))
  }
  return 3
}

export function defaultSleepHours(value: string | null | undefined): number {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 8
  if (raw.includes('less_than_6') || raw.includes('less than 6')) return 7
  if (raw.includes('6_to_7') || raw.includes('6–7') || raw.includes('6-7')) return 7.5
  if (raw.includes('7_to_8') || raw.includes('7–8') || raw.includes('7-8')) return 8
  if (raw.includes('8_plus') || raw.includes('8+')) return 8
  const n = Number(raw.match(/(\d+(?:\.\d+)?)/)?.[1])
  if (Number.isFinite(n) && n >= 5 && n <= 10) return n
  return 8
}

export function formatSleepHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '')
}

export function planHasStepGuidance(plan: LifestyleGuidancePlan): boolean {
  return extractStepCount(plan.cardio_plan) != null
}

export function textHasWaterGuidance(text: string | null | undefined): boolean {
  return /(\d+(?:\.\d+)?)\s*l(?:iters?)?\b|\d{3,5}\s*ml\b/i.test(text ?? '')
}

export function textHasSleepGuidance(text: string | null | undefined): boolean {
  const raw = text ?? ''
  return (
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?).{0,24}sleep/i.test(raw) ||
    /sleep.{0,24}(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i.test(raw) ||
    /bed(?:time)?\s*(?:by|at)/i.test(raw) ||
    /aim for \d/i.test(raw)
  )
}

export function buildSleepWaterGuidance(profile: LifestyleGuidanceProfile): string {
  const hours = formatSleepHours(defaultSleepHours(profile.sleep_duration))
  const liters = defaultWaterLiters(profile.onboarding_data?.lifestyle?.waterIntake)
  return [
    SLEEP_WATER_HEADER,
    `Sleep: get ${hours} hours. Keep a steady bedtime and wake time, and dim screens in the last hour before bed.`,
    `Water: drink ${liters} liters across the day. A glass with each meal and one between meals is enough.`,
  ].join('\n')
}

export function withSleepWaterGuidance(
  coachNotes: string | null | undefined,
  profile: LifestyleGuidanceProfile
): string {
  const visible = stripPlanMeta(coachNotes)
  if (textHasSleepGuidance(visible) && textHasWaterGuidance(visible)) {
    return (coachNotes ?? '').trim()
  }

  const block = buildSleepWaterGuidance(profile)
  const nextVisible = [visible, block].filter(Boolean).join('\n\n')

  const meta = parsePlanMeta({ title: '', coach_notes: coachNotes ?? '' })
  if (coachNotes?.includes('@@META')) {
    return encodePlanMeta(meta, nextVisible) ?? nextVisible
  }
  return nextVisible
}

export function applyLifestyleGuidance(
  plan: LifestyleGuidancePlan,
  profile: LifestyleGuidanceProfile
): {
  cardio_plan: string
  coach_notes: string
  addedSteps: boolean
  addedSleepWater: boolean
} {
  const habit = profile.onboarding_data?.lifestyle?.dailySteps
  const existingSteps = extractStepCount(plan.cardio_plan)
  const addedSteps = existingSteps == null
  const cardio_plan = formatStepsOnlyCardio(existingSteps ?? defaultDailyStepTarget(habit))

  const beforeNotes = plan.coach_notes ?? ''
  const coach_notes = withSleepWaterGuidance(beforeNotes, profile)
  const addedSleepWater = stripPlanMeta(coach_notes) !== stripPlanMeta(beforeNotes)

  return { cardio_plan, coach_notes, addedSteps, addedSleepWater }
}

export async function persistLifestyleGuidance(
  admin: SupabaseClient,
  planId: string,
  plan: LifestyleGuidancePlan,
  profile: LifestyleGuidanceProfile
): Promise<{ addedSteps: boolean; addedSleepWater: boolean }> {
  const next = applyLifestyleGuidance(plan, profile)
  if (!next.addedSteps && !next.addedSleepWater) {
    return { addedSteps: false, addedSleepWater: false }
  }
  const { error } = await admin
    .from('plans')
    .update({
      cardio_plan: next.cardio_plan,
      coach_notes: next.coach_notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
  if (error) throw new Error(error.message)
  return { addedSteps: next.addedSteps, addedSleepWater: next.addedSleepWater }
}
