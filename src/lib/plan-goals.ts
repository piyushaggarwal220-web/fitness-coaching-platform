import {
  COACHING_PLANS,
  getCoachingPlan,
  type CoachingPlanSlug,
} from '@/lib/payments/plans'
import { planPathForSlug } from '@/lib/payments/plan-pages'

export const PLAN_GOAL_MIN = 2
export const PLAN_GOAL_MAX = 4

export type PlanGoalTier = CoachingPlanSlug

export type PlanGoalOption = {
  value: string
  label: string
  tier: PlanGoalTier
}

/**
 * Goals unlocked at each plan tier (higher tiers also unlock lower-tier goals).
 * Former 1-month foundation goals are included in the 3-month starter plan.
 */
export const PLAN_GOALS_BY_TIER: Record<PlanGoalTier, readonly PlanGoalOption[]> = {
  '3_months': [
    { value: 'debloat_body', label: 'Debloat Body', tier: '3_months' },
    { value: 'build_consistency', label: 'Build Consistency', tier: '3_months' },
    { value: 'lose_weight_a_bit', label: 'Lose Weight a Bit', tier: '3_months' },
    { value: 'increase_energy', label: 'Increase Energy', tier: '3_months' },
    { value: 'improve_fitness', label: 'Improve Fitness', tier: '3_months' },
    { value: 'fat_loss', label: 'Fat Loss', tier: '3_months' },
    { value: 'muscle_gain', label: 'Muscle Gain', tier: '3_months' },
    { value: 'body_recomposition', label: 'Body Recomposition', tier: '3_months' },
    { value: 'build_strength', label: 'Build Strength', tier: '3_months' },
    { value: 'improve_endurance', label: 'Improve Endurance', tier: '3_months' },
  ],
  '6_months': [
    { value: 'athletic_physique', label: 'Athletic Physique', tier: '6_months' },
    { value: 'visible_abs', label: 'Visible Abs', tier: '6_months' },
    { value: 'build_lean_muscle', label: 'Build Lean Muscle', tier: '6_months' },
    { value: 'increase_performance', label: 'Increase Performance', tier: '6_months' },
    { value: 'improve_mobility', label: 'Improve Mobility', tier: '6_months' },
  ],
  '12_months': [
    { value: 'shredded_physique', label: 'Shredded Physique', tier: '12_months' },
    { value: 'aesthetic_physique', label: 'Aesthetic Physique', tier: '12_months' },
    { value: 'maximum_natural_muscle', label: 'Maximum Natural Muscle', tier: '12_months' },
    { value: 'complete_body_transformation', label: 'Complete Body Transformation', tier: '12_months' },
  ],
} as const

export const PLAN_GOAL_TIER_ORDER: readonly PlanGoalTier[] = [
  '3_months',
  '6_months',
  '12_months',
] as const

export const PLAN_GOAL_TIER_META: Record<
  PlanGoalTier,
  { title: string; shortLabel: string; accent: string }
> = {
  '3_months': { title: '3 Months', shortLabel: 'Momentum', accent: '#38bdf8' },
  '6_months': { title: '6 Months', shortLabel: 'Transformation', accent: '#a78bfa' },
  '12_months': { title: '12 Months', shortLabel: 'Full Journey', accent: '#fbbf24' },
}

/** Flat catalog of every plan-gated goal. */
export const ALL_PLAN_GOAL_OPTIONS: readonly PlanGoalOption[] = PLAN_GOAL_TIER_ORDER.flatMap(
  (tier) => PLAN_GOALS_BY_TIER[tier]
)

export const PLAN_GOAL_LABELS: Record<string, string> = Object.fromEntries(
  ALL_PLAN_GOAL_OPTIONS.map((goal) => [goal.value, goal.label])
)

/** Map client-facing goals to coaching categories used by AI / complexity. */
export const PLAN_GOAL_COACHING_CATEGORY: Record<string, string> = {
  debloat_body: 'fat_loss',
  build_consistency: 'recomposition',
  lose_weight_a_bit: 'fat_loss',
  increase_energy: 'athletic_performance',
  improve_fitness: 'athletic_performance',
  fat_loss: 'fat_loss',
  muscle_gain: 'muscle_gain',
  body_recomposition: 'recomposition',
  build_strength: 'strength',
  improve_endurance: 'athletic_performance',
  athletic_physique: 'athletic_performance',
  visible_abs: 'fat_loss',
  build_lean_muscle: 'muscle_gain',
  increase_performance: 'athletic_performance',
  improve_mobility: 'athletic_performance',
  shredded_physique: 'fat_loss',
  aesthetic_physique: 'recomposition',
  maximum_natural_muscle: 'muscle_gain',
  complete_body_transformation: 'recomposition',
}

const BODY_COMP_CATEGORIES = new Set(['fat_loss', 'recomposition'])

export function planTierRank(slug: string | null | undefined): number {
  if (!slug) return -1
  // Retired 1-month purchases map to the current starter tier for goal unlock.
  if (slug === '1_month') return planTierRank('3_months')
  return PLAN_GOAL_TIER_ORDER.indexOf(slug as PlanGoalTier)
}

export function isValidPlanGoalTier(slug: string | null | undefined): slug is PlanGoalTier {
  return Boolean(slug && PLAN_GOAL_TIER_ORDER.includes(slug as PlanGoalTier))
}

/** Normalize purchase / trial plan to a goal unlock tier. */
export function resolveGoalPlanTier(
  planSlug: string | null | undefined,
  options?: { accessSource?: string | null }
): PlanGoalTier {
  if (planSlug === '1_month') return '3_months'
  if (isValidPlanGoalTier(planSlug)) return planSlug
  // Admin trials and unknown entitlements get the full goal catalog.
  if (options?.accessSource === 'admin_trial') return '12_months'
  return '3_months'
}

export function isGoalUnlockedForPlan(
  goal: PlanGoalOption | string,
  planSlug: string | null | undefined
): boolean {
  const tier = typeof goal === 'string' ? ALL_PLAN_GOAL_OPTIONS.find((g) => g.value === goal)?.tier : goal.tier
  if (!tier) return false
  return planTierRank(planSlug) >= planTierRank(tier)
}

export function getUnlockedGoals(planSlug: string | null | undefined): PlanGoalOption[] {
  return ALL_PLAN_GOAL_OPTIONS.filter((goal) => isGoalUnlockedForPlan(goal, planSlug))
}

export function getLockedGoals(planSlug: string | null | undefined): PlanGoalOption[] {
  return ALL_PLAN_GOAL_OPTIONS.filter((goal) => !isGoalUnlockedForPlan(goal, planSlug))
}

export function getGoalByValue(value: string | null | undefined): PlanGoalOption | null {
  if (!value) return null
  return ALL_PLAN_GOAL_OPTIONS.find((goal) => goal.value === value) ?? null
}

export function formatPlanGoalLabel(value: string | null | undefined): string {
  if (!value) return 'Not set'
  return PLAN_GOAL_LABELS[value] ?? value.replace(/_/g, ' ')
}

export function formatSelectedGoals(values: string[] | null | undefined): string {
  if (!values || values.length === 0) return 'Not set'
  return values.map((value) => formatPlanGoalLabel(value)).join(', ')
}

export function deriveCoachingCategory(selectedGoals: string[] | null | undefined): string | null {
  if (!selectedGoals || selectedGoals.length === 0) return null

  // Prefer the most ambitious (highest-tier) selected goal for coaching focus.
  const ranked = [...selectedGoals]
    .map((value) => getGoalByValue(value))
    .filter((goal): goal is PlanGoalOption => Boolean(goal))
    .sort((a, b) => planTierRank(b.tier) - planTierRank(a.tier))

  const primary = ranked[0] ?? getGoalByValue(selectedGoals[0])
  if (!primary) return selectedGoals[0] ?? null
  return PLAN_GOAL_COACHING_CATEGORY[primary.value] ?? primary.value
}

export function isBodyCompositionGoal(fitnessGoal: string | null | undefined): boolean {
  if (!fitnessGoal) return false
  const category = PLAN_GOAL_COACHING_CATEGORY[fitnessGoal] ?? fitnessGoal
  return BODY_COMP_CATEGORIES.has(category)
}

export function validateSelectedPlanGoals(
  selected: string[],
  planSlug: string | null | undefined
): string | null {
  const unique = Array.from(new Set(selected))
  if (unique.length < PLAN_GOAL_MIN) {
    return `Select at least ${PLAN_GOAL_MIN} goals.`
  }
  if (unique.length > PLAN_GOAL_MAX) {
    return `Select up to ${PLAN_GOAL_MAX} goals.`
  }

  const unknown = unique.filter((value) => !getGoalByValue(value))
  if (unknown.length > 0) {
    return 'Please select valid goals from the list.'
  }

  // Only enforce plan locks when we know the client's plan.
  if (planSlug != null && planSlug !== '') {
    const locked = unique.filter((value) => !isGoalUnlockedForPlan(value, planSlug))
    if (locked.length > 0) {
      const first = getGoalByValue(locked[0])
      const required = first ? PLAN_GOAL_TIER_META[first.tier].title : 'a higher'
      return `“${formatPlanGoalLabel(locked[0])}” requires the ${required} plan. Upgrade to unlock it, or choose another goal.`
    }
  }

  return null
}

export function upgradeHrefForTier(tier: PlanGoalTier): string {
  return `/checkout?plan=${tier}`
}

export function upgradePlanPathForTier(tier: PlanGoalTier): string {
  return `/plans/${planPathForSlug(tier)}`
}

export function planDisplayName(planSlug: string | null | undefined): string {
  if (planSlug === '1_month') return '1 Month (legacy)'
  return getCoachingPlan(planSlug)?.name ?? COACHING_PLANS['3_months'].name
}

export function nextUpgradeTier(currentPlan: string | null | undefined): PlanGoalTier[] {
  const rank = planTierRank(resolveGoalPlanTier(currentPlan))
  if (rank < 0) return [...PLAN_GOAL_TIER_ORDER]
  return PLAN_GOAL_TIER_ORDER.filter((_, index) => index > rank)
}
