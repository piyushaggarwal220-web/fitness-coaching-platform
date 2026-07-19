import {
  calculateBmi,
  calculateComplexityScore,
  toDisplayScore,
} from '@/lib/ai/complexity-score'

export type ComplexityMetricValues = {
  age?: number | string | null
  height?: number | string | null
  weight?: number | string | null
  gender?: string | null
  fitnessGoal?: string | null
  activityLevel?: string | null
  trainingExperience?: string | null
  dietPreference?: string | null
  injuries?: string | null
  medicalNotes?: string | null
  sleepDuration?: string | null
}

export type ComplexityInputGuardOptions = {
  previousDisplayScore?: number | null
  /** Soft flag when display score jumps by this much (default 35). */
  scoreJumpThreshold?: number
}

export type ComplexityInputGuardResult = {
  ok: boolean
  reasons: string[]
  needsReview: boolean
  values: {
    age: number | null
    height: number | null
    weight: number | null
    bmi: number | null
  }
}

const AGE_MIN = 13
const AGE_MAX = 100
const HEIGHT_MIN_CM = 120
const HEIGHT_MAX_CM = 230
const WEIGHT_MIN_KG = 30
const WEIGHT_MAX_KG = 250
const BMI_MIN = 14
const BMI_MAX = 55
const DEFAULT_SCORE_JUMP = 35

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

/**
 * Validate age/height/weight for impossible or highly suspicious values.
 * Soft flags (score jump) also set needsReview without rejecting save.
 */
export function evaluateComplexityInputs(
  metrics: ComplexityMetricValues,
  options: ComplexityInputGuardOptions = {}
): ComplexityInputGuardResult {
  const reasons: string[] = []
  const age = toFiniteNumber(metrics.age)
  const height = toFiniteNumber(metrics.height)
  const weight = toFiniteNumber(metrics.weight)
  const bmi = calculateBmi(height, weight)

  if (age !== null && (age < AGE_MIN || age > AGE_MAX || !Number.isInteger(age))) {
    reasons.push(`Age ${age} looks incorrect (expected ${AGE_MIN}–${AGE_MAX}).`)
  }

  if (height !== null && (height < HEIGHT_MIN_CM || height > HEIGHT_MAX_CM)) {
    reasons.push(`Height ${height} cm looks incorrect (expected ${HEIGHT_MIN_CM}–${HEIGHT_MAX_CM} cm).`)
  }

  if (weight !== null && (weight < WEIGHT_MIN_KG || weight > WEIGHT_MAX_KG)) {
    reasons.push(`Weight ${weight} kg looks incorrect (expected ${WEIGHT_MIN_KG}–${WEIGHT_MAX_KG} kg).`)
  }

  if (bmi !== null && (bmi < BMI_MIN || bmi > BMI_MAX)) {
    reasons.push(`BMI ${bmi.toFixed(1)} looks impossible from the height/weight you entered.`)
  }

  const jumpThreshold = options.scoreJumpThreshold ?? DEFAULT_SCORE_JUMP
  const previous = options.previousDisplayScore
  if (previous != null && Number.isFinite(previous) && age !== null && height !== null && weight !== null) {
    const scored = calculateComplexityScore({
      age,
      height,
      weight,
      gender: metrics.gender,
      fitnessGoal: metrics.fitnessGoal,
      activityLevel: metrics.activityLevel,
      trainingExperience: metrics.trainingExperience,
      dietPreference: metrics.dietPreference,
      injuries: metrics.injuries,
      medicalNotes: metrics.medicalNotes,
      sleepDuration: metrics.sleepDuration,
    })
    const nextDisplay = toDisplayScore(scored.score)
    if (Math.abs(nextDisplay - previous) >= jumpThreshold) {
      reasons.push(
        `Your updated metrics would change coaching complexity from ${previous} to ${nextDisplay}. Please re-check them.`
      )
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    needsReview: reasons.length > 0,
    values: { age, height, weight, bmi },
  }
}

export function complexityReviewBlockedMessage(reasons?: string[] | null): string {
  const detail =
    reasons && reasons.length > 0
      ? ` Reasons: ${reasons.join(' ')}`
      : ''
  return `Client must confirm their height, weight, and age before AI plan work.${detail}`
}

export function parseReviewReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

/** True when the profile gate is set or live metrics currently look impossible. */
export function profileBlocksAiPlanWork(profile: {
  age?: number | string | null
  height?: number | string | null
  weight?: number | string | null
  complexity_input_needs_review?: boolean | null
  complexity_input_review_reasons?: unknown
  complexity_score?: number | null
}): { blocked: boolean; reasons: string[] } {
  if (profile.complexity_input_needs_review) {
    return {
      blocked: true,
      reasons: parseReviewReasons(profile.complexity_input_review_reasons),
    }
  }

  const live = evaluateComplexityInputs(
    {
      age: profile.age,
      height: profile.height,
      weight: profile.weight,
    },
    {
      previousDisplayScore:
        typeof profile.complexity_score === 'number' ? profile.complexity_score : null,
    }
  )

  return { blocked: live.needsReview, reasons: live.reasons }
}
