/** Athletic body is the 12-month coaching plan. */
export const ATHLETIC_BODY_PLAN_SLUG = '12_months'
export const HOURGLASS_GOAL = 'hourglass_physique'

export function isAthleticBodyPlan(slug: string | null | undefined): boolean {
  return slug === ATHLETIC_BODY_PLAN_SLUG
}

/** 3-month offer already bundles testo; athletic body does too. */
export function planIncludesTestosteroneBoost(
  slug: string | null | undefined,
  gender: string | null | undefined
): boolean {
  if (gender !== 'male') return false
  return slug === 'offer_3_months' || isAthleticBodyPlan(slug)
}

export function athleticBodyIncludesHourglassGuidance(
  slug: string | null | undefined,
  gender: string | null | undefined
): boolean {
  return isAthleticBodyPlan(slug) && gender === 'female'
}

export function shouldApplyHourglassGuidance(input: {
  planSlug?: string | null
  gender?: string | null
  selectedGoals?: string[] | null
}): boolean {
  if (input.gender === 'male') return false
  if (input.selectedGoals?.includes(HOURGLASS_GOAL)) return true
  return athleticBodyIncludesHourglassGuidance(input.planSlug, input.gender)
}

/** Injected into plan generation so Athletic body women get waist-and-hip shaping, not a male V-taper. */
export const HOURGLASS_GUIDANCE_PROMPT = [
  'HOURGLASS GUIDANCE (included for this woman — follow on the workout and diet):',
  'Shape toward a narrower waist, fuller glutes and hips, and a balanced upper body.',
  'Prioritize glutes, hamstrings, side delts, and back width. Keep heavy compounds.',
  'Do not program a male V-taper, a bulk-for-bulk split, or endless ab isolation.',
  'Do not sell waist trainers, spot-reduction, hormones, or a promised waist or hip number.',
  'Nutrition: keep protein high. Prefer recomposition or a mild deficit so hips and glutes do not flatten, unless she asked for a faster cut.',
].join(' ')
