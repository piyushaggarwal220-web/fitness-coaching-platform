import { MODELS } from '@/lib/ai/config'
import type { Checkin } from '@/types/database'

/** Tier labels used for model routing. */
export type ComplexityTier = 'LOW' | 'MEDIUM' | 'HIGH'

/** Subset of check-in fields used for complexity adjustments. */
export type ComplexityCheckinInput = Pick<
  Checkin,
  'energy_level' | 'hunger_level' | 'training_performance' | 'adherence_score' | 'notes'
>

/**
 * Client profile inputs for complexity scoring.
 * Field names map to `profiles` columns (camelCase here for the TS API).
 */
export type ComplexityScoreInput = {
  age: number | string | null | undefined
  gender: string | null | undefined
  height: number | string | null | undefined
  weight: number | string | null | undefined
  bodyFat?: number | string | null | undefined
  fitnessGoal: string | null | undefined
  activityLevel: string | null | undefined
  trainingExperience: string | null | undefined
  dietPreference: string | null | undefined
  injuries: string | null | undefined
  medicalNotes: string | null | undefined
  sleepDuration: string | null | undefined
  latestCheckin?: ComplexityCheckinInput | null
}

export type ComplexityScoreResult = {
  score: number
  tier: ComplexityTier
  recommendedModel: string
  reasoning: string[]
}

/**
 * Project scoring specification — single source of truth for point values and tier cutoffs.
 * Adjust only this block when complexity rules change.
 */
export const SCORING_SPEC = {
  tiers: {
    LOW_MAX: 4,
    MEDIUM_MAX: 10,
  },
  /** Maximum theoretical raw points for 0–100 display normalization. */
  display: {
    MAX_RAW_SCORE: 33,
  },
  age: {
    UNDER_18: 2,
    FORTY_FIVE_TO_FIFTY_FOUR: 1,
    FIFTY_FIVE_PLUS: 2,
  },
  bmi: {
    UNDERWEIGHT: 1,
    OVERWEIGHT: 1,
    OBESE: 2,
    thresholds: {
      underweight: 18.5,
      overweight: 25,
      obese: 30,
    },
  },
  bodyFat: {
    ELEVATED: 1,
    HIGH: 2,
    VERY_LOW: 1,
    thresholds: {
      elevated: 25,
      high: 35,
      veryLow: 10,
    },
  },
  gender: {
    FEMALE_BODY_COMP_GOAL: 1,
  },
  fitnessGoal: {
    muscle_gain: 0,
    fat_loss: 1,
    strength: 1,
    recomposition: 3,
    athletic_performance: 2,
  },
  trainingExperience: {
    beginner: 1,
    intermediate: 0,
    advanced: 2,
  },
  activityLevel: {
    sedentary: 1,
    lightly_active: 0,
    moderately_active: 0,
    very_active: 1,
  },
  dietPreference: {
    non_vegetarian: 0,
    eggetarian: 1,
    vegetarian: 1,
    vegan: 2,
  },
  health: {
    INJURIES: 3,
    MEDICAL_NOTES: 3,
  },
  sleepDuration: {
    less_than_6: 2,
    '6_to_7': 1,
    '7_to_8': 0,
    '8_plus': 0,
  },
  checkin: {
    LOW_ADHERENCE: 3,
    MODERATE_ADHERENCE: 1,
    LOW_ENERGY: 2,
    LOW_TRAINING_PERFORMANCE: 2,
    HIGH_HUNGER_ON_FAT_LOSS: 2,
    CONCERNING_NOTES: 1,
    adherenceLow: 5,
    adherenceModerate: 7,
    energyLow: 4,
    trainingLow: 4,
    hungerHigh: 8,
  },
} as const

type ScoreContribution = {
  points: number
  reason: string
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function hasMeaningfulText(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

/** BMI from height (cm) and weight (kg). Returns null when inputs are invalid. */
export function calculateBmi(
  height: number | string | null | undefined,
  weight: number | string | null | undefined
): number | null {
  const heightCm = toNumber(height)
  const weightKg = toNumber(weight)
  if (heightCm === null || weightKg === null || heightCm <= 0 || weightKg <= 0) return null

  const heightM = heightCm / 100
  return weightKg / (heightM * heightM)
}

function scoreAge(age: number | string | null | undefined): ScoreContribution[] {
  const value = toNumber(age)
  if (value === null) return []

  if (value < 18) {
    return [{ points: SCORING_SPEC.age.UNDER_18, reason: `Age ${value} — youth programming considerations` }]
  }
  if (value >= 55) {
    return [{ points: SCORING_SPEC.age.FIFTY_FIVE_PLUS, reason: `Age ${value} — elevated recovery and risk considerations` }]
  }
  if (value >= 45) {
    return [{ points: SCORING_SPEC.age.FORTY_FIVE_TO_FIFTY_FOUR, reason: `Age ${value} — moderate age-related complexity` }]
  }
  return []
}

function scoreBmi(bmi: number | null): ScoreContribution[] {
  if (bmi === null) return []

  const { thresholds, UNDERWEIGHT, OVERWEIGHT, OBESE } = SCORING_SPEC.bmi

  if (bmi >= thresholds.obese) {
    return [{ points: OBESE, reason: `BMI ${bmi.toFixed(1)} — obese range` }]
  }
  if (bmi >= thresholds.overweight) {
    return [{ points: OVERWEIGHT, reason: `BMI ${bmi.toFixed(1)} — overweight range` }]
  }
  if (bmi < thresholds.underweight) {
    return [{ points: UNDERWEIGHT, reason: `BMI ${bmi.toFixed(1)} — underweight range` }]
  }
  return []
}

function scoreBodyFat(bodyFat: number | string | null | undefined): ScoreContribution[] {
  const value = toNumber(bodyFat)
  if (value === null) return []

  const { thresholds, ELEVATED, HIGH, VERY_LOW } = SCORING_SPEC.bodyFat

  if (value >= thresholds.high) {
    return [{ points: HIGH, reason: `Body fat ${value}% — high` }]
  }
  if (value >= thresholds.elevated) {
    return [{ points: ELEVATED, reason: `Body fat ${value}% — elevated` }]
  }
  if (value < thresholds.veryLow) {
    return [{ points: VERY_LOW, reason: `Body fat ${value}% — very low` }]
  }
  return []
}

function scoreGender(
  gender: string | null | undefined,
  fitnessGoal: string | null | undefined
): ScoreContribution[] {
  if (gender !== 'female') return []

  const bodyCompGoals = new Set(['fat_loss', 'recomposition'])
  if (!fitnessGoal || !bodyCompGoals.has(fitnessGoal)) return []

  return [{
    points: SCORING_SPEC.gender.FEMALE_BODY_COMP_GOAL,
    reason: 'Female client with body-composition goal — hormonal cycle considerations',
  }]
}

function scoreEnumField(
  value: string | null | undefined,
  table: Record<string, number>,
  label: string
): ScoreContribution[] {
  if (!value || !(value in table)) return []
  const points = table[value]
  if (points <= 0) return []
  return [{ points, reason: `${label}: ${value.replace(/_/g, ' ')}` }]
}

function scoreHealth(
  injuries: string | null | undefined,
  medicalNotes: string | null | undefined
): ScoreContribution[] {
  const contributions: ScoreContribution[] = []

  if (hasMeaningfulText(injuries)) {
    contributions.push({
      points: SCORING_SPEC.health.INJURIES,
      reason: 'Reported injuries require exercise modifications',
    })
  }
  if (hasMeaningfulText(medicalNotes)) {
    contributions.push({
      points: SCORING_SPEC.health.MEDICAL_NOTES,
      reason: 'Medical notes require coach awareness and caution',
    })
  }
  return contributions
}

function scoreCheckin(
  checkin: ComplexityCheckinInput | null | undefined,
  fitnessGoal: string | null | undefined
): ScoreContribution[] {
  if (!checkin) return []

  const contributions: ScoreContribution[] = []
  const rules = SCORING_SPEC.checkin

  if (checkin.adherence_score !== null && checkin.adherence_score <= rules.adherenceLow) {
    contributions.push({
      points: rules.LOW_ADHERENCE,
      reason: `Low adherence score (${checkin.adherence_score}/10)`,
    })
  } else if (checkin.adherence_score !== null && checkin.adherence_score <= rules.adherenceModerate) {
    contributions.push({
      points: rules.MODERATE_ADHERENCE,
      reason: `Moderate adherence score (${checkin.adherence_score}/10)`,
    })
  }

  if (checkin.energy_level !== null && checkin.energy_level <= rules.energyLow) {
    contributions.push({
      points: rules.LOW_ENERGY,
      reason: `Low energy level (${checkin.energy_level}/10)`,
    })
  }

  if (checkin.training_performance !== null && checkin.training_performance <= rules.trainingLow) {
    contributions.push({
      points: rules.LOW_TRAINING_PERFORMANCE,
      reason: `Low training performance (${checkin.training_performance}/10)`,
    })
  }

  if (
    fitnessGoal === 'fat_loss' &&
    checkin.hunger_level !== null &&
    checkin.hunger_level >= rules.hungerHigh
  ) {
    contributions.push({
      points: rules.HIGH_HUNGER_ON_FAT_LOSS,
      reason: `High hunger (${checkin.hunger_level}/10) during fat-loss phase`,
    })
  }

  if (hasMeaningfulText(checkin.notes)) {
    contributions.push({
      points: rules.CONCERNING_NOTES,
      reason: 'Client check-in notes present — may need nuanced review',
    })
  }

  return contributions
}

/** Map a numeric score to LOW / MEDIUM / HIGH using SCORING_SPEC tier cutoffs. */
export function getTierFromScore(score: number): ComplexityTier {
  if (score <= SCORING_SPEC.tiers.LOW_MAX) return 'LOW'
  if (score <= SCORING_SPEC.tiers.MEDIUM_MAX) return 'MEDIUM'
  return 'HIGH'
}

/** Map raw algorithm score to 0–100 display scale (higher = more complex). */
export function toDisplayScore(rawScore: number): number {
  const max = SCORING_SPEC.display.MAX_RAW_SCORE
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((rawScore / max) * 100)))
}

export type StoredComplexityTier = 'low' | 'medium' | 'high'

export function toStoredTier(tier: ComplexityTier): StoredComplexityTier {
  return tier.toLowerCase() as StoredComplexityTier
}

export function fromStoredTier(tier: StoredComplexityTier | string | null | undefined): ComplexityTier | null {
  if (!tier) return null
  const normalized = tier.toUpperCase()
  if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH') {
    return normalized as ComplexityTier
  }
  return null
}

export function formatDisplayScore(rawScore: number): string {
  return `${toDisplayScore(rawScore)} / 100`
}

/** Route tier to the configured Claude model ID. */
export function getRecommendedModelForTier(tier: ComplexityTier): string {
  switch (tier) {
    case 'LOW':
      return MODELS.CLAUDE_HAIKU
    case 'MEDIUM':
    case 'HIGH':
      return MODELS.CLAUDE_SONNET
  }
}

/**
 * Calculate coaching complexity from profile and optional check-in data.
 * Pure function — no I/O, no AI calls, fully unit-testable.
 */
export function calculateComplexityScore(input: ComplexityScoreInput): ComplexityScoreResult {
  const bmi = calculateBmi(input.height, input.weight)

  const contributions: ScoreContribution[] = [
    ...scoreAge(input.age),
    ...scoreBmi(bmi),
    ...scoreBodyFat(input.bodyFat),
    ...scoreGender(input.gender, input.fitnessGoal),
    ...scoreEnumField(input.fitnessGoal, SCORING_SPEC.fitnessGoal, 'Fitness goal'),
    ...scoreEnumField(input.trainingExperience, SCORING_SPEC.trainingExperience, 'Training experience'),
    ...scoreEnumField(input.activityLevel, SCORING_SPEC.activityLevel, 'Activity level'),
    ...scoreEnumField(input.dietPreference, SCORING_SPEC.dietPreference, 'Diet preference'),
    ...scoreEnumField(input.sleepDuration, SCORING_SPEC.sleepDuration, 'Sleep duration'),
    ...scoreHealth(input.injuries, input.medicalNotes),
    ...scoreCheckin(input.latestCheckin, input.fitnessGoal),
  ]

  const score = contributions.reduce((total, item) => total + item.points, 0)
  const tier = getTierFromScore(score)
  const recommendedModel = getRecommendedModelForTier(tier)

  const reasoning = contributions.length > 0
    ? contributions.map((item) => `+${item.points}: ${item.reason}`)
    : ['No complexity factors detected — straightforward coaching case']

  return { score, tier, recommendedModel, reasoning }
}
