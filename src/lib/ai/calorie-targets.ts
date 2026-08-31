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

export type ClientCalorieTargets = {
  maintenance: number
  min: number
  max: number
  preferred: number
  floorKcal: number
  fluxLabel: string
  fluxLevel: MetabolicFluxLevel
  activityLevel: string
}

type CalorieProfile = Pick<
  OnboardingProfile,
  | 'weight'
  | 'height'
  | 'age'
  | 'gender'
  | 'activity_level'
  | 'fitness_goal'
  | 'onboarding_data'
  | 'sleep_duration'
  | 'training_experience'
  | 'injuries'
>

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

function parseTrainingDaysPerWeek(profile: Pick<OnboardingProfile, 'onboarding_data'>): number | null {
  const raw = profile.onboarding_data?.training?.daysPerWeek
  const days = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
  return Number.isFinite(days) && days > 0 ? days : null
}

/** Boost activity tier when the client trains most days — maintenance must reflect gym load. */
export function resolveEffectiveActivityLevel(
  profile: Pick<OnboardingProfile, 'activity_level' | 'onboarding_data'>
): string {
  const base = profile.activity_level?.trim() || 'moderately_active'
  let level = ACTIVITY_MULTIPLIER[base] ? base : 'moderately_active'
  const days = parseTrainingDaysPerWeek(profile)

  if (days != null && days >= 6) {
    level = 'very_active'
  } else if (days != null && days >= 4) {
    if (level === 'sedentary' || level === 'lightly_active') level = 'moderately_active'
    else if (level === 'moderately_active') level = 'very_active'
  } else if (days != null && days >= 3 && level === 'sedentary') {
    level = 'lightly_active'
  }

  return level
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
  } else if (/recomp|recomposition|athletic|performance|maintain|strength/.test(goal)) {
    min = maintenance - 50
    max = maintenance + 200
  }

  min = Math.max(Math.round(min), floorKcal)
  max = Math.max(Math.round(max), min + 100)

  const preferred = Math.round(min + (max - min) * 0.72)

  return { maintenance: Math.round(maintenance), min, max, preferred }
}

/** Single source of truth: maintenance + band from profile (no coach input). */
export function resolveClientCalorieTargets(profile: CalorieProfile): ClientCalorieTargets | null {
  const activityLevel = resolveEffectiveActivityLevel(profile)
  const maintenance = estimateMaintenanceCalories({
    weightKg: profile.weight,
    heightCm: profile.height,
    age: profile.age,
    gender: profile.gender,
    activityLevel,
  })
  if (!maintenance) return null

  const flux = resolveMetabolicFluxPlan(profile as OnboardingProfile)
  const floorKcal = resolveDietFloorKcal(profile.weight)
  const band = calorieTargetBand(maintenance, profile.fitness_goal, flux.level, floorKcal)

  return {
    maintenance: band.maintenance,
    min: band.min,
    max: band.max,
    preferred: band.preferred,
    floorKcal,
    fluxLabel: flux.label,
    fluxLevel: flux.level,
    activityLevel,
  }
}

/** Injected into every diet prompt — exact numbers from profile math. */
export function formatMandatoryCalorieTargetBlock(profile: CalorieProfile): string | null {
  const targets = resolveClientCalorieTargets(profile)
  if (!targets) return null

  const days = parseTrainingDaysPerWeek(profile)
  const trainingNote =
    days != null ? ` Training ${days} days/week factored into activity (${targets.activityLevel}).` : ''

  return [
    'AUTOMATED CALORIE TARGET (computed from client profile — mandatory, no guessing):',
    `- Maintenance (Mifflin-St Jeor): ${targets.maintenance} kcal/day.${trainingNote}`,
    `- Metabolic flux: ${targets.fluxLabel}.`,
    `- Allowed band: ${targets.min} to ${targets.max} kcal/day.`,
    `- REQUIRED daily average in meal lines: ${targets.preferred} kcal/day (±50 kcal).`,
    `- nutrition_plan.calories MUST be ${targets.preferred}. Calories header MUST be ${targets.preferred}.`,
    `- Every Daily Total line must average ${targets.preferred} kcal when summed across the week.`,
    `- Do NOT use round guesses (1800, 2000, etc.) unless they equal ${targets.preferred}.`,
    `- If portions sum below ${targets.min}, increase roti/rice/dal/paneer/snacks/oil until Daily Totals hit ${targets.preferred}.`,
    '- Header, weekly average, and each meal macro line must agree.',
  ].join('\n')
}

/** Default diet rewrite instruction when the coach does not type anything. */
export function autoDietCoachInstruction(profile: CalorieProfile): string {
  const targets = resolveClientCalorieTargets(profile)
  if (!targets) {
    return 'Rebuild the full 7-day diet from the client profile with honest meal-level calorie math. No edit meta.'
  }
  return [
    `Rebuild the full 7-day diet from the client profile.`,
    `Required daily average: ${targets.preferred} kcal/day (maintenance ~${targets.maintenance}, band ${targets.min}-${targets.max}).`,
    `Every Daily Total must land near ${targets.preferred} kcal.`,
    'No edit meta.',
  ].join(' ')
}

export function formatCalorieTargetPrompt(profile: CalorieProfile): string | null {
  return formatMandatoryCalorieTargetBlock(profile)
}
