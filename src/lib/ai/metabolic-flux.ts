import { DIET_FLOOR_TARGET_KCAL } from '@/lib/ai/plan-quality-rules'
import type { OnboardingProfile } from '@/types/database'

/** Client-stated willingness for higher energy-in + higher energy-out coaching. */
export type FluxCapacityPreference = 'steady' | 'build_up' | 'high_flux'

/** Effective coaching bias after recovery/experience safety caps. */
export type MetabolicFluxLevel = FluxCapacityPreference

export type MetabolicFluxPlan = {
  preference: FluxCapacityPreference | null
  level: MetabolicFluxLevel
  /** Short label for UI / logs */
  label: string
  dampenReasons: string[]
  /** Diet guidance for LLM prompts */
  dietGuidance: string
  /** Training / steps / cardio guidance for LLM prompts */
  outputGuidance: string
}

const LEVEL_RANK: Record<MetabolicFluxLevel, number> = {
  steady: 0,
  build_up: 1,
  high_flux: 2,
}

const RANK_TO_LEVEL: MetabolicFluxLevel[] = ['steady', 'build_up', 'high_flux']

function clampLevel(level: MetabolicFluxLevel, max: MetabolicFluxLevel): MetabolicFluxLevel {
  return LEVEL_RANK[level] <= LEVEL_RANK[max] ? level : max
}

function stepDown(level: MetabolicFluxLevel): MetabolicFluxLevel {
  return RANK_TO_LEVEL[Math.max(0, LEVEL_RANK[level] - 1)]!
}

function hasMeaningfulText(value: string | null | undefined): boolean {
  const t = value?.trim().toLowerCase() ?? ''
  if (!t) return false
  return !['none', 'n/a', 'na', 'no', 'nil', '-'].includes(t)
}

function parsePreference(raw: string | null | undefined): FluxCapacityPreference | null {
  if (raw === 'steady' || raw === 'build_up' || raw === 'high_flux') return raw
  return null
}

/**
 * Resolve how hard to push caloric intake AND training/steps together.
 * Default is high_flux when the client has not answered yet.
 * Sleep, stress, injuries, and experience cap aggressiveness.
 */
export function resolveMetabolicFluxPlan(profile: OnboardingProfile): MetabolicFluxPlan {
  const preference =
    parsePreference(profile.onboarding_data?.lifestyle?.fluxCapacity) ?? null
  // Product default: push toward high flux unless the client opted steady or recovery forbids it.
  let level: MetabolicFluxLevel = preference ?? 'high_flux'
  const dampenReasons: string[] = []

  if (profile.sleep_duration === 'less_than_6') {
    level = clampLevel(level, 'steady')
    dampenReasons.push('sleep under 6h — keep intake/output conservative until sleep improves')
  }

  if (profile.onboarding_data?.lifestyle?.stressLevel === 'very_high') {
    const capped = clampLevel(level, 'build_up')
    if (capped !== level) {
      level = capped
      dampenReasons.push('very high stress — avoid max high-flux load')
    }
  }

  if (profile.training_experience === 'beginner' && level === 'high_flux') {
    level = 'build_up'
    dampenReasons.push('beginner — ramp toward high flux; do not start at max')
  }

  if (
    hasMeaningfulText(profile.injuries) ||
    profile.onboarding_data?.medical?.painDuringExercise === 'yes'
  ) {
    const next = stepDown(level)
    if (next !== level) {
      level = next
      dampenReasons.push('injury/pain flagged — reduce training density one notch')
    }
  }

  if (
    !preference &&
    profile.training_experience === 'advanced' &&
    (profile.sleep_duration === '7_to_8' || profile.sleep_duration === '8_plus') &&
    profile.onboarding_data?.lifestyle?.stressLevel === 'low' &&
    level === 'build_up' &&
    dampenReasons.length === 0
  ) {
    level = 'high_flux'
  }

  const labels: Record<MetabolicFluxLevel, string> = {
    steady: 'Steady (comfortable food + training)',
    build_up: 'Build-up (raise food + output gradually)',
    high_flux: 'High flux (higher calories + higher training/steps)',
  }

  const dietByLevel: Record<MetabolicFluxLevel, string> = {
    steady: [
      'Calorie bias: STEADY; prioritize adherence, but still raise output before cutting food.',
      'Fat loss: maintenance to shallow 200 to 300 kcal deficit. When progress stalls, add steps/training/cardio FIRST — never slash calories as the first lever.',
      'Muscle gain: 150 to 250 kcal surplus. Recomp: maintenance.',
      'Keep food volume manageable; avoid forcing large meals if appetite is limited.',
      `Floor still at least ${DIET_FLOOR_TARGET_KCAL} kcal. If a lower intake seems indicated, stay at the floor and flag the coach.`,
      'If eating is already low and weight is not dropping: reverse diet (raise calories gradually), never cut further.',
      'For weight gain goals: do not force oversized surpluses; let metabolism correct with a modest surplus.',
    ].join(' '),
    build_up: [
      'Calorie bias: BUILD-UP toward higher metabolic flux (eat more while moving more).',
      'Fat loss: mild 200 to 300 kcal deficit — create most of the gap via steps/training, not food cuts.',
      'Muscle gain: 250 to 350 kcal surplus with enough carbs around training; do not force huge meals.',
      'Recomp: slight surplus on training days / maintenance on rest (about plus or minus 100 kcal).',
      'Prefer higher-volume meals (veg, lean protein, dairy/curd, fruit) so the client can eat more without feeling restricted.',
      `Floor at least ${DIET_FLOOR_TARGET_KCAL} kcal.`,
      'If eating is already low and weight is not dropping: reverse diet (raise calories gradually).',
    ].join(' '),
    high_flux: [
      'Calorie bias: HIGH FLUX; higher energy-in paired with higher energy-out.',
      'Fat loss: mild 150 to 250 kcal deficit (keep intake relatively high; create the gap mainly via steps/training).',
      'Muscle gain: assertive 300 to 400 kcal surplus with high meal volume, still without forcing food they cannot finish.',
      'Recomp: clear training-day surplus (about 200 to 300) and near-maintenance rest days.',
      `Use denser + higher-volume foods so hitting calories is realistic; never below ${DIET_FLOOR_TARGET_KCAL} kcal.`,
      'If hunger is low, spread calories across more feedings rather than cutting the target.',
      'If eating is already low and weight is not dropping: reverse diet (raise calories gradually).',
    ].join(' '),
  }

  const outputByLevel: Record<MetabolicFluxLevel, string> = {
    steady: [
      'Output bias: STEADY — stay within stated training days/duration; modest step targets (~+0–1k vs current habit).',
      'Do not stack extra accessory sets. Keep 2 to 3 working sets per exercise unless a single main compound needs 4.',
    ].join(' '),
    build_up: [
      'Output bias: BUILD-UP — fill the allowed training days/duration with quality work (2 to 3 working sets per exercise, not extra junk sets).',
      'Steps: raise ~1.5–3k above current daily-steps habit (cap realistically for schedule).',
      'Cardio: prefer sustainable LISS/walks that support the higher intake; avoid punishing HIIT that collapses adherence.',
    ].join(' '),
    high_flux: [
      'Output bias: HIGH FLUX — use the allowed days/duration fully, still capping working sets (2 to 3 per exercise, 4 only on one main compound).',
      'Steps: raise ~3–5k above current habit when schedule allows (still must be achievable).',
      'Cardio/NEAT: prioritize daily walking + optional LISS so the higher calorie intake is matched by output.',
      'Never exceed hard constraints on days/week, session duration, equipment, or injury limits.',
    ].join(' '),
  }

  return {
    preference,
    level,
    label: labels[level],
    dampenReasons,
    dietGuidance: dietByLevel[level],
    outputGuidance: outputByLevel[level],
  }
}

/** Prompt block injected into plan generation. */
export function buildMetabolicFluxSection(profile: OnboardingProfile): string {
  const plan = resolveMetabolicFluxPlan(profile)
  const preferenceLabel = plan.preference
    ? plan.label
    : `${plan.label} (default — client has not answered yet; lean toward higher flux safely)`

  return [
    '## Metabolic Flux Bias (MUST follow; scale intake AND output together)',
    'LURVOX preference: push clients toward HIGH metabolic flux — higher caloric intake paired with higher training/steps. Increase expenditure before reducing calories. Never a crash deficit with low output, and never huge calories with sedentary days.',
    'When progress stalls or the client is "not losing": raise steps/cardio/training density first; do NOT cut food unless intake is already well above maintenance and output is maxed within their schedule.',
    'Pair with mesocycle: calories rise with weekly intensity inside the month. On a new lower-volume month, HOLD calories (do not trim) and raise steps/cardio if fat loss is the goal.',
    `- Effective level: ${preferenceLabel}`,
    plan.dampenReasons.length > 0
      ? `- Safety dampeners applied: ${plan.dampenReasons.join('; ')}`
      : '- Safety dampeners applied: none',
    `- Diet: ${plan.dietGuidance}`,
    `- Training/steps/cardio: ${plan.outputGuidance}`,
  ].join('\n')
}
