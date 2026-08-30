import type { MetabolicFluxLevel } from '@/lib/ai/metabolic-flux'
import { resolveMetabolicFluxPlan } from '@/lib/ai/metabolic-flux'
import { DIET_FLOOR_TARGET_KCAL } from '@/lib/ai/plan-quality-rules'
import type { OnboardingProfile } from '@/types/database'

const ACTIVITY_MULTIPLIER: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
}

/** True when the client explicitly asked to change intake targets. */
export function clientRequestTouchesCalories(request: string): boolean {
  const t = request.toLowerCase()
  return /\b(calor(?:y|ies)?|kcal|macros?|deficit|surplus|bulk(?:ing)?|cut(?:ting)?|eat\s+more|eat\s+less|hungry|maintenance|protein\s+target|carbs?|fat\s+target|increase\s+food|decrease\s+food|portion)\b/i.test(
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
  weightKg?: number | null
  heightCm?: number | null
  age?: number | null
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

const FAT_LOSS_DEFICIT: Record<MetabolicFluxLevel, { min: number; max: number }> = {
  steady: { min: 350, max: 150 },
  build_up: { min: 300, max: 100 },
  high_flux: { min: 250, max: 50 },
}

/** Suggested daily target band for prompts — never below the platform floor. */
export function calorieTargetBand(
  maintenance: number,
  goalHint?: string | null,
  fluxLevel: MetabolicFluxLevel = 'high_flux'
): {
  maintenance: number
  min: number
  max: number
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

  min = Math.max(Math.round(min), DIET_FLOOR_TARGET_KCAL)
  max = Math.max(Math.round(max), min + 100)

  return { maintenance: Math.round(maintenance), min, max }
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
  const band = calorieTargetBand(maintenance, profile.fitness_goal, flux.level)
  return [
    'CALORIE TARGET (use this math — do not guess lower):',
    `- Estimated maintenance: ~${band.maintenance} kcal/day.`,
    `- Metabolic flux level: ${flux.label}.`,
    `- Program this client between ~${band.min} and ~${band.max} kcal/day for their goal.`,
    '- High-flux rule: create fat-loss gaps mainly through steps/training/cardio, not by slashing food first.',
    `- Never below ${DIET_FLOOR_TARGET_KCAL} kcal/day. If food portions sum lower, add carbs/fats the client will eat.`,
    '- Header calories, daily average lines, and meal (P:…| ~K kcal) lines must all match.',
  ].join('\n')
}
