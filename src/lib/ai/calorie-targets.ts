import type { MetabolicFluxLevel } from '@/lib/ai/metabolic-flux'
import { resolveMetabolicFluxPlan } from '@/lib/ai/metabolic-flux'
import { DIET_FLOOR_BASE_KCAL, resolveDietFloorKcal } from '@/lib/ai/plan-quality-rules'
import type { OnboardingProfile } from '@/types/database'

const ACTIVITY_MULTIPLIER: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
}

/** True when intake change language appears in client or coach text. */
export function requestTouchesCalories(...parts: Array<string | null | undefined>): boolean {
  return parts.some((part) => part?.trim() && clientRequestTouchesCalories(part))
}

/** Client/coach asked to land at maintenance rather than a deficit. */
export function requestTargetsMaintenance(...parts: Array<string | null | undefined>): boolean {
  const combined = parts.filter(Boolean).join(' ').toLowerCase()
  return /\b(maintenance|maintain(?:ance)?|at\s+maintenance|maintenance\s+level|maintenance\s+calories?)\b/i.test(
    combined
  )
}

/** True when the client explicitly asked to change intake targets. */
export function clientRequestTouchesCalories(request: string): boolean {
  const t = request.toLowerCase()
  return /\b(calor(?:y|ies)?|kcal|macros?|deficit|surplus|bulk(?:ing)?|cut(?:ting)?|eat\s+more|eat\s+less|hungry|maintenance|protein\s+target|carbs?|fat\s+target|increase\s+food|decrease\s+food|portion|raise|increas(?:e|ing))\b/i.test(
    t
  )
}

/** Plateau / stall language — respond with higher output, not lower calories. */
export function clientRequestNeedsExpenditureFocus(request: string): boolean {
  const t = request.toLowerCase()
  return /\b(not\s+losing|not\s+gaining|plateau|stuck|stall(?:ed|ing)?|no\s+progress|weight\s+not\s+(?:moving|changing|dropping)|slow\s+progress|not\s+seeing\s+results)\b/i.test(
    t
  )
}

/** Mifflin-St Jeor maintenance estimate (kcal/day). Falls back to weight × 30 when data is thin. */
export function estimateMaintenanceCalories(input: {
  weightKg?: number | string | null
  heightCm?: number | string | null
  age?: number | string | null
  gender?: string | null
  activityLevel?: string | null
}): number | null {
  const weight = Number(input.weightKg)
  if (!Number.isFinite(weight) || weight <= 0) return null

  const height = Number(input.heightCm)
  const age = Number(input.age)
  const gender = (input.gender ?? '').toLowerCase()
  const activity = ACTIVITY_MULTIPLIER[input.activityLevel ?? ''] ?? 1.45

  let bmr: number
  if (Number.isFinite(height) && height > 0 && Number.isFinite(age) && age > 0) {
    if (gender === 'female') {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161
    } else if (gender === 'male') {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 78
    }
  } else {
    bmr = weight * 30 / activity
  }

  const maintenance = Math.round(bmr * activity)
  return Number.isFinite(maintenance) && maintenance > 0 ? maintenance : Math.round(weight * 30)
}

/** Fat-loss deficit from maintenance: smaller numbers = higher food (high flux = shallow cut). */
const FAT_LOSS_DEFICIT: Record<MetabolicFluxLevel, { min: number; max: number }> = {
  steady: { min: 280, max: 120 },
  build_up: { min: 180, max: 70 },
  high_flux: { min: 130, max: 40 },
}

/** Suggested daily target band for prompts — never below the platform floor. */
export function calorieTargetBand(
  maintenance: number,
  goalHint?: string | null,
  fluxLevel: MetabolicFluxLevel = 'high_flux',
  floorKcal: number = DIET_FLOOR_BASE_KCAL
): {
  maintenance: number
  min: number
  max: number
  /** Default target — upper half of band; AI should land here, not at min. */
  preferred: number
} {
  const goal = (goalHint ?? '').toLowerCase()
  let min = maintenance * 0.85
  let max = maintenance * 1.1

  if (/fat|loss|cut|lean|shred|weight\s*loss|lose/.test(goal)) {
    const deficit = FAT_LOSS_DEFICIT[fluxLevel]
    min = maintenance - deficit.min
    max = maintenance - deficit.max
  } else if (/gain|bulk|muscle|size|mass|weight\s*gain/.test(goal)) {
    min = maintenance + 150
    max = maintenance + 400
  } else if (/recomp|recomposition|athletic|performance|maintain/.test(goal)) {
    min = maintenance - 50
    max = maintenance + 200
  }

  min = Math.max(Math.round(min), floorKcal)
  max = Math.max(Math.round(max), min + 100)

  const preferred = Math.round(min + (max - min) * 0.72)

  return { maintenance: Math.round(maintenance), min, max, preferred }
}

export function formatCalorieTargetPrompt(profile: Pick<
  OnboardingProfile,
  'weight' | 'height' | 'age' | 'gender' | 'activity_level' | 'fitness_goal' | 'onboarding_data' | 'sleep_duration' | 'training_experience' | 'injuries'
>): string | null {
  const maintenance = estimateMaintenanceCalories({
    weightKg: profile.weight,
    heightCm: profile.height,
    age: profile.age,
    gender: profile.gender,
    activityLevel: profile.activity_level,
  })
  if (!maintenance) return null

  const flux = resolveMetabolicFluxPlan(profile as OnboardingProfile)
  const floorKcal = resolveDietFloorKcal(profile.weight)
  const band = calorieTargetBand(maintenance, profile.fitness_goal, flux.level, floorKcal)
  return [
    'CALORIE TARGET (computed in code — do not guess lower):',
    `- Estimated maintenance: ~${band.maintenance} kcal/day.`,
    `- Metabolic flux level: ${flux.label}.`,
    `- Allowed band: ~${band.min} to ~${band.max} kcal/day.`,
    `- REQUIRED daily average from meal math: ~${band.preferred} kcal/day (upper half of band).`,
    '- Every Daily Total / daily average line must land near this target. The Calories header must match the weekly average of those lines — never a higher header with lower meal totals.',
    '- High-flux rule: eat on the higher side AND raise steps/training/cardio in the same plan. Never low food + high output only, or high food + sedentary days.',
    `- Never below ${floorKcal} kcal/day in meal lines. If portions sum lower, add carbs/fats the client will eat until Daily Totals hit the target.`,
    '- Header calories, daily average lines, and meal (P:…| ~K kcal) lines must all match.',
  ].join('\n')
}
