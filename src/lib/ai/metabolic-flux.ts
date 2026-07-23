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
 * Default leans toward build_up (higher flux) when the client has not answered yet.
 * Sleep, stress, injuries, and experience cap aggressiveness.
 */
export function resolveMetabolicFluxPlan(profile: OnboardingProfile): MetabolicFluxPlan {
  const preference =
    parsePreference(profile.onboarding_data?.lifestyle?.fluxCapacity) ?? null
  // Product default: push toward higher flux unless the client opted steady or recovery forbids it.
  let level: MetabolicFluxLevel = preference ?? 'build_up'
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

  // Strong recovery + advanced: allow nudging missing/steady answers toward build_up only (never force high_flux).
  if (
    !preference &&
    profile.training_experience === 'advanced' &&
    (profile.sleep_duration === '7_to_8' || profile.sleep_duration === '8_plus') &&
    profile.onboarding_data?.lifestyle?.stressLevel === 'low' &&
    level === 'build_up'
  ) {
    // Keep build_up; prompt text already pushes upper band within level.
  }

  const labels: Record<MetabolicFluxLevel, string> = {
    steady: 'Steady (comfortable food + training)',
    build_up: 'Build-up (raise food + output gradually)',
    high_flux: 'High flux (higher calories + higher training/steps)',
  }

  const dietByLevel: Record<MetabolicFluxLevel, string> = {
    steady: [
      'Calorie bias: STEADY — prioritize adherence over throughput.',
      'Fat loss: 350–450 kcal deficit (do not crash). Muscle gain: 150–250 kcal surplus. Recomp: maintenance.',
      'Keep food volume manageable; avoid forcing large meals if appetite is limited.',
      'Floor still ≥1600 kcal unless a clinician context says otherwise.',
    ].join(' '),
    build_up: [
      'Calorie bias: BUILD-UP toward higher metabolic flux (eat more while moving more).',
      'Fat loss: shallower 250–350 kcal deficit so absolute intake stays higher while steps/training rise.',
      'Muscle gain: 250–350 kcal surplus with enough carbs around training.',
      'Recomp: slight surplus on training days / maintenance on rest (~±100 kcal).',
      'Prefer higher-volume meals (veg, lean protein, dairy/curd, fruit) so the client can eat more without feeling restricted.',
      'Floor ≥1600 kcal.',
    ].join(' '),
    high_flux: [
      'Calorie bias: HIGH FLUX — higher energy-in paired with higher energy-out.',
      'Fat loss: mild 150–250 kcal deficit (keep intake relatively high; create the gap mainly via steps/training).',
      'Muscle gain: assertive 300–450 kcal surplus with high meal volume.',
      'Recomp: clear training-day surplus (~200–300) and near-maintenance rest days.',
      'Use denser + higher-volume foods so hitting calories is realistic; never below 1600 kcal.',
      'If hunger is low, spread calories across more feedings rather than cutting the target.',
    ].join(' '),
  }

  const outputByLevel: Record<MetabolicFluxLevel, string> = {
    steady: [
      'Output bias: STEADY — stay within stated training days/duration; modest step targets (~+0–1k vs current habit).',
      'Do not stack aggressive accessories or high-intensity cardio on poor recovery.',
    ].join(' '),
    build_up: [
      'Output bias: BUILD-UP — fill the allowed training days/duration with productive density (quality sets, controlled rest).',
      'Steps: raise ~1.5–3k above current daily-steps habit (cap realistically for schedule).',
      'Cardio: prefer sustainable LISS/walks that support the higher intake; avoid punishing HIIT that collapses adherence.',
    ].join(' '),
    high_flux: [
      'Output bias: HIGH FLUX — push upper end of allowed days/duration with denser sessions (more total weekly sets within hard caps, not ego loading).',
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
    '## Metabolic Flux Bias (MUST follow — scale intake AND output together)',
    'LURVOX preference: push clients toward higher metabolic flux (higher caloric intake + higher training/steps), scaled to this client — never a crash deficit with low output, and never huge calories with sedentary days.',
    `- Effective level: ${preferenceLabel}`,
    plan.dampenReasons.length > 0
      ? `- Safety dampeners applied: ${plan.dampenReasons.join('; ')}`
      : '- Safety dampeners applied: none',
    `- Diet: ${plan.dietGuidance}`,
    `- Training/steps/cardio: ${plan.outputGuidance}`,
  ].join('\n')
}
