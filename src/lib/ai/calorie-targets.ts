import type { MetabolicFluxLevel } from '@/lib/ai/metabolic-flux'
import { resolveMetabolicFluxPlan } from '@/lib/ai/metabolic-flux'
import { DIET_FLOOR_BASE_KCAL, resolveDietFloorKcal } from '@/lib/ai/plan-quality-rules'
import type { OnboardingProfile } from '@/types/database'

/** Platform-standard maintenance formula — always use for diet calorie targets when profile inputs exist. */
export const CALORIE_FORMULA_STANDARD = 'Mifflin-St Jeor'

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

/** One precise daily kcal from maintenance + goal — not a band guess. */
function resolveGoalCalorieTarget(
  maintenance: number,
  goalHint: string | null | undefined,
  fluxLevel: MetabolicFluxLevel,
  floorKcal: number
): number {
  const goal = (goalHint ?? '').toLowerCase()
  const m = Math.round(maintenance)

  if (/fat|loss|cut|lean|shred|weight\s*loss|lose/.test(goal)) {
    // High-flux philosophy: ~100–150 kcal below maintenance; gap mostly from output.
    const belowMaintenance =
      fluxLevel === 'high_flux' ? 125 : fluxLevel === 'build_up' ? 125 : 200
    return Math.max(m - belowMaintenance, floorKcal)
  }
  if (/gain|bulk|muscle|size|mass|weight\s*gain/.test(goal)) {
    return m + 275
  }
  if (/recomp|recomposition|athletic|performance|maintain|strength/.test(goal)) {
    return m
  }
  return m
}

/** Goal band for tolerance checks; preferred is the single real target inside it. */
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

  let preferred = resolveGoalCalorieTarget(maintenance, goalHint, fluxLevel, floorKcal)
  preferred = Math.min(Math.max(preferred, min), max)

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

const ACTIVITY_MULTIPLIER_LABEL: Record<string, string> = {
  sedentary: '1.2 (sedentary)',
  lightly_active: '1.375 (lightly active)',
  moderately_active: '1.55 (moderately active)',
  very_active: '1.725 (very active)',
}

function formatBmrFormula(gender: string | null | undefined): string {
  const g = (gender ?? '').toLowerCase()
  if (g === 'female') return '10×weight(kg) + 6.25×height(cm) − 5×age − 161'
  if (g === 'male') return '10×weight(kg) + 6.25×height(cm) − 5×age + 5'
  return '10×weight(kg) + 6.25×height(cm) − 5×age − 78 (neutral estimate)'
}

function formatGoalAdjustmentLine(
  goal: string,
  maintenance: number,
  preferred: number
): string {
  if (/fat|loss|cut|lean|shred|weight\s*loss|lose/.test(goal)) {
    return `Fat loss: maintenance (~${maintenance}) minus a mild high-flux deficit (~100–150 kcal) → plan around ~${preferred} kcal/day. Most gap from steps/training, not food slashing.`
  }
  if (/gain|bulk|muscle|size|mass|weight\s*gain/.test(goal)) {
    return `Muscle gain: maintenance (~${maintenance}) plus surplus → plan around ~${preferred} kcal/day.`
  }
  if (/recomp|recomposition|athletic|performance|maintain|strength/.test(goal)) {
    return `Recomp / performance: plan at maintenance (~${preferred} kcal/day) — enough to train hard and recover.`
  }
  return `Default: plan near maintenance (~${preferred} kcal/day) unless goal clearly needs deficit or surplus.`
}

/** Rule-based calorie guidance — teach Mifflin-St Jeor + profile inputs; reference kcal, not a hard chase number. */
export function formatCalorieGuidanceBlock(profile: CalorieProfile): string | null {
  const targets = resolveClientCalorieTargets(profile)
  const flux = resolveMetabolicFluxPlan(profile as OnboardingProfile)
  const days = parseTrainingDaysPerWeek(profile)
  const goal = (profile.fitness_goal ?? '').toLowerCase()
  const weight = Number(profile.weight)
  const height = Number(profile.height)
  const age = Number(profile.age)
  const hasFormulaInputs =
    Number.isFinite(weight) &&
    weight > 0 &&
    Number.isFinite(height) &&
    height > 0 &&
    Number.isFinite(age) &&
    age > 0

  const activityLevel = targets?.activityLevel ?? profile.activity_level ?? 'moderately_active'
  const activityFactor =
    ACTIVITY_MULTIPLIER_LABEL[activityLevel] ?? ACTIVITY_MULTIPLIER_LABEL.moderately_active!

  const trainingNote =
    days != null && days >= 5
      ? `Training ${days} days/week — activity tier bumped to ${activityLevel} for maintenance math.`
      : days != null && days >= 3
        ? `Training ${days} days/week — factor gym load into portion sizes.`
        : null

  const formulaSection = hasFormulaInputs
    ? [
        'CALORIE METHOD — use Mifflin-St Jeor (platform standard; do not guess round numbers like 1800):',
        `1. BMR = ${formatBmrFormula(profile.gender)}`,
        `   Inputs: ${Math.round(weight)} kg, ${Math.round(height)} cm, ${Math.round(age)} y, ${profile.gender ?? 'unspecified'}.`,
        `2. Maintenance = BMR × ${activityFactor}`,
        targets
          ? `   Reference maintenance: ~${targets.maintenance} kcal/day.`
          : null,
        targets
          ? `3. Goal adjustment: ${formatGoalAdjustmentLine(goal, targets.maintenance, targets.preferred)}`
          : '3. Adjust maintenance for goal (mild deficit for fat loss, surplus for bulk, at maintenance for recomp).',
        targets
          ? `4. Build all 7 days so honest meal math averages ~${targets.preferred} kcal/day (±100). Calories header must match meal totals.`
          : '4. Build all 7 days with honest meal math; header must match meal totals.',
      ]
    : [
        'CALORIE METHOD — use Mifflin-St Jeor when weight, height, and age are available:',
        `BMR = ${formatBmrFormula(profile.gender)}; Maintenance = BMR × activity factor (${activityFactor}).`,
        weight > 0
          ? `Client ~${Math.round(weight)} kg — if height/age missing, estimate maintenance generously from size and training load (not a 1500–1800 template).`
          : 'Estimate maintenance from profile size and activity — no one-size-fits-all crash diet.',
      ]

  return [
    ...formulaSection,
    `- Metabolic flux: ${targets?.fluxLabel ?? flux.label}. Pair higher intake with higher output when flux is high.`,
    trainingNote,
    '- Never inflate the header above what portions actually sum to.',
    '- If protein is hard to hit with allowed foods, lower protein — never cut rice/roti/oil to chase grams.',
    '- Plateaus: raise steps/training first; do not slash food.',
  ]
    .filter((line): line is string => line != null)
    .join('\n')
}

/** @deprecated Use formatCalorieGuidanceBlock — kept for imports. */
export function formatMandatoryCalorieTargetBlock(profile: CalorieProfile): string | null {
  return formatCalorieGuidanceBlock(profile)
}

/** Default diet rewrite instruction when the coach does not type anything. */
export function autoDietCoachInstruction(profile: CalorieProfile): string {
  return [
    'Rebuild the full 7-day diet from the client profile.',
    'Use the Mifflin-St Jeor CALORIE METHOD in the prompt: compute maintenance from weight/height/age/activity, adjust for goal, build meals to that reference with honest math.',
    'No edit meta.',
  ].join(' ')
}

export function formatCalorieTargetPrompt(profile: CalorieProfile): string | null {
  return formatCalorieGuidanceBlock(profile)
}
