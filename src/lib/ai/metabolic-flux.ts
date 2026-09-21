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
 * Default is steady when the client has not answered — high flux (and its step
 * targets) only apply when they explicitly chose high_flux. Not everyone can
 * hit high daily steps.
 * Sleep, stress, injuries, and experience further cap aggressiveness.
 */
export function resolveMetabolicFluxPlan(profile: OnboardingProfile): MetabolicFluxPlan {
  const preference =
    parsePreference(profile.onboarding_data?.lifestyle?.fluxCapacity) ?? null
  // Only clients who opted into high_flux get that bias. Unset → steady.
  let level: MetabolicFluxLevel = preference ?? 'steady'
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

/** True only when this client's effective flux level is high_flux (explicit opt-in). */
export function shouldApplyHighFluxRules(
  profile: OnboardingProfile | null | undefined
): boolean {
  if (!profile) return false
  return resolveMetabolicFluxPlan(profile).level === 'high_flux'
}

/** Prompt block injected into plan generation. */
export function buildMetabolicFluxSection(profile: OnboardingProfile): string {
  const plan = resolveMetabolicFluxPlan(profile)
  const preferenceLabel = plan.preference
    ? plan.label
    : `${plan.label} (default — client has not chosen flux capacity; keep steps realistic for their schedule)`

  const levelRule =
    plan.level === 'high_flux'
      ? 'This client opted into HIGH flux: pair higher caloric intake with higher training/steps. Never a crash deficit with low output, and never huge calories with sedentary days.'
      : plan.level === 'build_up'
        ? 'This client is BUILD-UP: raise food and output gradually. Step targets must stay realistic for their schedule — do not force high-flux step counts.'
        : 'This client is STEADY: keep food and training comfortable. Modest step targets only (~+0–1k vs habit). Do NOT prescribe high-flux step targets or force large meal volumes.'

  return [
    '## Metabolic Flux Bias (MUST follow; scale intake AND output to THIS client\'s level)',
    'Match intensity to the effective level below. High flux / very high steps are ONLY for clients at high_flux — many clients cannot sustain high daily steps.',
    'Increase expenditure before reducing calories when progress stalls, but only within what their schedule and flux level allow.',
    'Pair with mesocycle: HOLD calories flat week to week — do NOT raise food with weekly intensity. Change calories only when the coach specifically asks. On a new lower-volume month, still HOLD calories (do not trim) and raise steps/cardio only if that fits their level and schedule.',
    levelRule,
    `- Effective level: ${preferenceLabel}`,
    plan.dampenReasons.length > 0
      ? `- Safety dampeners applied: ${plan.dampenReasons.join('; ')}`
      : '- Safety dampeners applied: none',
    `- Diet: ${plan.dietGuidance}`,
    `- Training/steps/cardio: ${plan.outputGuidance}`,
  ].join('\n')
}
