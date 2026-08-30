import {
  COACHING_PLANS,
  getCoachingPlan,
  type CoachingPlanSlug,
} from '@/lib/payments/plans'
import { planPathForSlug } from '@/lib/payments/plan-pages'

export const PLAN_GOAL_MIN = 2
export const PLAN_GOAL_MAX = 4

/** Goal tiers match active coaching plans. */
export type PlanGoalTier = CoachingPlanSlug

export type PlanGoalGender = 'female' | 'male'

/** Starting body-type path chosen before picking goals. */
export type GoalBodyType = 'weight_gain' | 'skinny_fat' | 'lose_fat_fast'

export type GoalSection = 'body' | 'physique'

export type PlanGoalOption = {
  value: string
  label: string
  tier: PlanGoalTier
  /** Body-path goals. Physique goals omit this and use section: 'physique'. */
  bodyTypes?: readonly GoalBodyType[]
  section?: GoalSection
  /** When set, goal is only shown/selectable for these genders. */
  genders?: readonly PlanGoalGender[]
}

export const GOAL_BODY_TYPE_ORDER: readonly GoalBodyType[] = [
  'weight_gain',
  'skinny_fat',
  'lose_fat_fast',
] as const

export const GOAL_BODY_TYPE_META: Record<
  GoalBodyType,
  { title: string; description: string }
> = {
  weight_gain: {
    title: 'Gain weight / fill out',
    description: 'Skinny, hardgainer, or want to look fuller overall.',
  },
  skinny_fat: {
    title: 'Skinny-fat',
    description: 'Soft midsection, thin arms/legs — want to look tighter and more athletic.',
  },
  lose_fat_fast: {
    title: 'Lose fat fast',
    description: 'Main goal is dropping fat quickly and feeling lighter in daily life.',
  },
}

const F = ['female'] as const
const M = ['male'] as const

/**
 * Full goal catalog: body-path goals + optional gendered physique goals.
 * Higher plan tiers unlock lower-tier goals.
 */
export const PLAN_GOAL_CATALOG: readonly PlanGoalOption[] = [
  // ── Weight gain · 3 months ───────────────────────────────────────────
  { value: 'healthy_weight_gain', label: 'Healthy Weight Gain', tier: '3_months', bodyTypes: ['weight_gain'] },
  { value: 'soft_bulk_start', label: 'Soft Bulk Start', tier: '3_months', bodyTypes: ['weight_gain'] },
  { value: 'bigger_appetite_habit', label: 'Bigger Appetite Habit', tier: '3_months', bodyTypes: ['weight_gain'] },
  { value: 'fill_out_arms', label: 'Fill Out Arms', tier: '3_months', bodyTypes: ['weight_gain'] },
  { value: 'muscle_gain', label: 'Muscle Gain', tier: '3_months', bodyTypes: ['weight_gain'] },
  { value: 'build_strength', label: 'Build Strength', tier: '3_months', bodyTypes: ['weight_gain', 'skinny_fat'] },
  { value: 'gain_without_bloating', label: 'Gain Without Bloating', tier: '3_months', bodyTypes: ['weight_gain'] },

  // ── Skinny-fat · 3 months ────────────────────────────────────────────
  { value: 'lose_fat_build_muscle', label: 'Lose Fat + Build Muscle', tier: '3_months', bodyTypes: ['skinny_fat'] },
  { value: 'tighten_midsection', label: 'Tighten Midsection', tier: '3_months', bodyTypes: ['skinny_fat'] },
  { value: 'tone_arms_and_legs', label: 'Tone Arms & Legs', tier: '3_months', bodyTypes: ['skinny_fat'] },
  { value: 'body_recomposition', label: 'Body Recomposition', tier: '3_months', bodyTypes: ['skinny_fat'] },
  { value: 'build_consistency', label: 'Build Consistency', tier: '3_months', bodyTypes: ['skinny_fat', 'lose_fat_fast', 'weight_gain'] },
  { value: 'improve_fitness', label: 'Improve Fitness', tier: '3_months', bodyTypes: ['skinny_fat', 'lose_fat_fast'] },

  // ── Lose fat fast · 3 months ─────────────────────────────────────────
  { value: 'fat_loss', label: 'Fat Loss', tier: '3_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'debloat_body', label: 'Debloat Body', tier: '3_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'lose_weight_a_bit', label: 'Lose Weight a Bit', tier: '3_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'drop_belly_fat_fast', label: 'Drop Belly Fat Fast', tier: '3_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'increase_energy', label: 'Increase Energy', tier: '3_months', bodyTypes: ['lose_fat_fast', 'weight_gain'] },
  { value: 'improve_endurance', label: 'Improve Endurance', tier: '3_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'feel_lighter_daily', label: 'Feel Lighter Daily', tier: '3_months', bodyTypes: ['lose_fat_fast'] },

  // ── Weight gain · 6 months ───────────────────────────────────────────
  { value: 'fill_out_frame', label: 'Fill Out Frame', tier: '6_months', bodyTypes: ['weight_gain'] },
  { value: 'soft_bulk_progress', label: 'Soft Bulk Progress', tier: '6_months', bodyTypes: ['weight_gain'] },
  { value: 'bigger_upper_body', label: 'Bigger Upper Body', tier: '6_months', bodyTypes: ['weight_gain'] },
  { value: 'stronger_legs_size', label: 'Stronger Legs Size', tier: '6_months', bodyTypes: ['weight_gain'] },
  { value: 'build_lean_muscle', label: 'Build Lean Muscle', tier: '6_months', bodyTypes: ['weight_gain', 'skinny_fat'] },
  { value: 'steady_size_gains', label: 'Steady Size Gains', tier: '6_months', bodyTypes: ['weight_gain'] },

  // ── Skinny-fat · 6 months ────────────────────────────────────────────
  { value: 'look_athletic', label: 'Look Athletic', tier: '6_months', bodyTypes: ['skinny_fat'] },
  { value: 'lean_recomposition', label: 'Lean Recomposition', tier: '6_months', bodyTypes: ['skinny_fat'] },
  { value: 'visible_shape', label: 'Visible Shape', tier: '6_months', bodyTypes: ['skinny_fat'] },
  { value: 'athletic_physique', label: 'Athletic Physique', tier: '6_months', bodyTypes: ['skinny_fat'] },
  { value: 'visible_abs', label: 'Visible Abs', tier: '6_months', bodyTypes: ['skinny_fat', 'lose_fat_fast'] },
  { value: 'increase_performance', label: 'Increase Performance', tier: '6_months', bodyTypes: ['skinny_fat', 'weight_gain'] },

  // ── Lose fat fast · 6 months ─────────────────────────────────────────
  { value: 'steady_fat_loss_momentum', label: 'Steady Fat Loss Momentum', tier: '6_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'shrink_waistline', label: 'Shrink Waistline', tier: '6_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'athletic_fat_loss', label: 'Athletic Fat Loss', tier: '6_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'improve_mobility', label: 'Improve Mobility', tier: '6_months', bodyTypes: ['lose_fat_fast', 'skinny_fat'] },
  { value: 'keep_muscle_while_cutting', label: 'Keep Muscle While Cutting', tier: '6_months', bodyTypes: ['lose_fat_fast'] },

  // ── Weight gain · 12 months ──────────────────────────────────────────
  { value: 'complete_size_transformation', label: 'Complete Size Transformation', tier: '12_months', bodyTypes: ['weight_gain'] },
  { value: 'maximum_natural_muscle', label: 'Maximum Natural Muscle', tier: '12_months', bodyTypes: ['weight_gain'] },
  { value: 'thick_athletic_build', label: 'Thick Athletic Build', tier: '12_months', bodyTypes: ['weight_gain'] },
  { value: 'hardgainer_breakthrough', label: 'Hardgainer Breakthrough', tier: '12_months', bodyTypes: ['weight_gain'] },

  // ── Skinny-fat · 12 months ───────────────────────────────────────────
  { value: 'aesthetic_physique', label: 'Aesthetic Physique', tier: '12_months', bodyTypes: ['skinny_fat'] },
  { value: 'complete_body_transformation', label: 'Complete Body Transformation', tier: '12_months', bodyTypes: ['skinny_fat', 'lose_fat_fast'] },
  { value: 'defined_athletic_look', label: 'Defined Athletic Look', tier: '12_months', bodyTypes: ['skinny_fat'] },
  { value: 'shredded_physique', label: 'Shredded Physique', tier: '12_months', bodyTypes: ['skinny_fat', 'lose_fat_fast'] },

  // ── Lose fat fast · 12 months ────────────────────────────────────────
  { value: 'complete_fat_loss_transformation', label: 'Complete Fat Loss Transformation', tier: '12_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'stay_lean_long_term', label: 'Stay Lean Long-Term', tier: '12_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'big_body_transformation', label: 'Big Body Transformation', tier: '12_months', bodyTypes: ['lose_fat_fast'] },
  { value: 'build_stamina', label: 'Build Stamina', tier: '12_months', bodyTypes: ['lose_fat_fast', 'skinny_fat', 'weight_gain'] },
  { value: 'athletic_conditioning', label: 'Athletic Conditioning', tier: '12_months', bodyTypes: ['lose_fat_fast', 'skinny_fat'] },

  // ── Optional physique · women ────────────────────────────────────────
  { value: 'tone_and_firm', label: 'Tone & Firm', tier: '3_months', section: 'physique', genders: F },
  { value: 'slim_waist', label: 'Slim Waist', tier: '3_months', section: 'physique', genders: F },
  { value: 'lifted_glutes', label: 'Lifted Glutes', tier: '3_months', section: 'physique', genders: F },
  { value: 'sculpted_curves', label: 'Sculpted Curves', tier: '6_months', section: 'physique', genders: F },
  { value: 'lean_toned_physique', label: 'Lean & Toned Physique', tier: '6_months', section: 'physique', genders: F },
  { value: 'strong_glutes_and_legs', label: 'Strong Glutes & Legs', tier: '6_months', section: 'physique', genders: F },
  { value: 'hourglass_physique', label: 'Hourglass Physique', tier: '12_months', section: 'physique', genders: F },

  // ── Optional physique · men ──────────────────────────────────────────
  { value: 'v_taper_start', label: 'V-Taper Start', tier: '3_months', section: 'physique', genders: M },
  { value: 'stronger_upper_body', label: 'Stronger Upper Body', tier: '3_months', section: 'physique', genders: M },
  { value: 'flat_stomach', label: 'Flat Stomach', tier: '3_months', section: 'physique', genders: M },
  { value: 'broad_shoulders', label: 'Broad Shoulders', tier: '6_months', section: 'physique', genders: M },
  { value: 'defined_chest_and_arms', label: 'Defined Chest & Arms', tier: '6_months', section: 'physique', genders: M },
  { value: 'lean_athletic_build', label: 'Lean Athletic Build', tier: '6_months', section: 'physique', genders: M },
  { value: 'classic_v_taper', label: 'Classic V-Taper', tier: '12_months', section: 'physique', genders: M },
  { value: 'peak_conditioning', label: 'Peak Conditioning', tier: '12_months', section: 'physique', genders: M },
] as const

export const PLAN_GOAL_TIER_ORDER: readonly PlanGoalTier[] = [
  '3_months',
  '6_months',
  '12_months',
] as const

export const PLAN_GOAL_TIER_META: Record<
  PlanGoalTier,
  { title: string; shortLabel: string; accent: string }
> = {
  '3_months': { title: 'Fat loss', shortLabel: '90 days', accent: '#38bdf8' },
  '6_months': { title: 'Fat loss + muscle gain', shortLabel: '6 months', accent: '#a78bfa' },
  '12_months': { title: 'Athletic body', shortLabel: '12 months', accent: '#fbbf24' },
}

/** Flat catalog of every plan-gated goal. */
export const ALL_PLAN_GOAL_OPTIONS: readonly PlanGoalOption[] = PLAN_GOAL_CATALOG

/** @deprecated Prefer filtering PLAN_GOAL_CATALOG by tier. Kept for older imports. */
export const PLAN_GOALS_BY_TIER: Record<PlanGoalTier, readonly PlanGoalOption[]> = {
  '3_months': PLAN_GOAL_CATALOG.filter((g) => g.tier === '3_months'),
  '6_months': PLAN_GOAL_CATALOG.filter((g) => g.tier === '6_months'),
  '12_months': PLAN_GOAL_CATALOG.filter((g) => g.tier === '12_months'),
}

export const PLAN_GOAL_LABELS: Record<string, string> = Object.fromEntries(
  ALL_PLAN_GOAL_OPTIONS.map((goal) => [goal.value, goal.label])
)

/** Map client-facing goals to coaching categories used by AI / complexity. */
export const PLAN_GOAL_COACHING_CATEGORY: Record<string, string> = {
  healthy_weight_gain: 'muscle_gain',
  soft_bulk_start: 'muscle_gain',
  bigger_appetite_habit: 'muscle_gain',
  fill_out_arms: 'muscle_gain',
  muscle_gain: 'muscle_gain',
  build_strength: 'strength',
  gain_without_bloating: 'muscle_gain',
  lose_fat_build_muscle: 'recomposition',
  tighten_midsection: 'recomposition',
  tone_arms_and_legs: 'recomposition',
  body_recomposition: 'recomposition',
  build_consistency: 'recomposition',
  improve_fitness: 'athletic_performance',
  fat_loss: 'fat_loss',
  debloat_body: 'fat_loss',
  lose_weight_a_bit: 'fat_loss',
  drop_belly_fat_fast: 'fat_loss',
  increase_energy: 'athletic_performance',
  improve_endurance: 'athletic_performance',
  feel_lighter_daily: 'fat_loss',
  fill_out_frame: 'muscle_gain',
  soft_bulk_progress: 'muscle_gain',
  bigger_upper_body: 'muscle_gain',
  stronger_legs_size: 'muscle_gain',
  build_lean_muscle: 'muscle_gain',
  steady_size_gains: 'muscle_gain',
  look_athletic: 'recomposition',
  lean_recomposition: 'recomposition',
  visible_shape: 'recomposition',
  athletic_physique: 'athletic_performance',
  visible_abs: 'fat_loss',
  increase_performance: 'athletic_performance',
  steady_fat_loss_momentum: 'fat_loss',
  shrink_waistline: 'fat_loss',
  athletic_fat_loss: 'fat_loss',
  improve_mobility: 'athletic_performance',
  keep_muscle_while_cutting: 'recomposition',
  complete_size_transformation: 'muscle_gain',
  maximum_natural_muscle: 'muscle_gain',
  thick_athletic_build: 'muscle_gain',
  hardgainer_breakthrough: 'muscle_gain',
  aesthetic_physique: 'recomposition',
  complete_body_transformation: 'recomposition',
  defined_athletic_look: 'recomposition',
  shredded_physique: 'fat_loss',
  complete_fat_loss_transformation: 'fat_loss',
  stay_lean_long_term: 'fat_loss',
  big_body_transformation: 'fat_loss',
  build_stamina: 'athletic_performance',
  athletic_conditioning: 'athletic_performance',
  tone_and_firm: 'recomposition',
  slim_waist: 'fat_loss',
  lifted_glutes: 'muscle_gain',
  sculpted_curves: 'recomposition',
  lean_toned_physique: 'recomposition',
  strong_glutes_and_legs: 'muscle_gain',
  hourglass_physique: 'recomposition',
  v_taper_start: 'muscle_gain',
  stronger_upper_body: 'muscle_gain',
  flat_stomach: 'fat_loss',
  broad_shoulders: 'muscle_gain',
  defined_chest_and_arms: 'muscle_gain',
  lean_athletic_build: 'recomposition',
  classic_v_taper: 'recomposition',
  peak_conditioning: 'fat_loss',
}

const BODY_COMP_CATEGORIES = new Set(['fat_loss', 'recomposition'])

export function isValidGoalBodyType(value: string | null | undefined): value is GoalBodyType {
  return Boolean(value && GOAL_BODY_TYPE_ORDER.includes(value as GoalBodyType))
}

export function isPhysiqueGoal(goal: PlanGoalOption | string): boolean {
  const option = typeof goal === 'string' ? getGoalByValue(goal) : goal
  return option?.section === 'physique'
}

export function goalMatchesBodyType(
  goal: PlanGoalOption | string,
  bodyType: GoalBodyType | null | undefined
): boolean {
  const option = typeof goal === 'string' ? getGoalByValue(goal) : goal
  if (!option) return false
  if (option.section === 'physique') return true
  if (!bodyType) return true
  if (!option.bodyTypes || option.bodyTypes.length === 0) return true
  return option.bodyTypes.includes(bodyType)
}

export function planTierRank(slug: string | null | undefined): number {
  if (!slug) return -1
  // Retired 1-month purchases map to the current starter tier for goal unlock.
  if (slug === '1_month') return planTierRank('3_months')
  return PLAN_GOAL_TIER_ORDER.indexOf(slug as PlanGoalTier)
}

export function isValidPlanGoalTier(slug: string | null | undefined): slug is PlanGoalTier {
  return Boolean(slug && PLAN_GOAL_TIER_ORDER.includes(slug as PlanGoalTier))
}

/** Normalize purchase / trial / enrollment plan to a goal unlock tier. */
export function resolveGoalPlanTier(
  planSlug: string | null | undefined,
  options?: { accessSource?: string | null }
): PlanGoalTier {
  // Admin trials and enrollment-code members get the full goal catalog.
  // Check access source first so a redeemed enrollment purchase's plan_slug
  // cannot re-lock higher-tier goals.
  if (
    options?.accessSource === 'admin_trial' ||
    options?.accessSource === 'enrollment_code'
  ) {
    return '12_months'
  }
  if (planSlug === '1_month') return '3_months'
  if (isValidPlanGoalTier(planSlug)) return planSlug
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

export function isGoalVisibleForGender(
  goal: PlanGoalOption | string,
  gender: string | null | undefined
): boolean {
  const option = typeof goal === 'string' ? getGoalByValue(goal) : goal
  if (!option) return false
  if (!option.genders || option.genders.length === 0) return true
  if (!gender) return false
  return option.genders.includes(gender as PlanGoalGender)
}

export function getGoalsForGender(
  goals: readonly PlanGoalOption[],
  gender: string | null | undefined
): PlanGoalOption[] {
  return goals.filter((goal) => isGoalVisibleForGender(goal, gender))
}

export function getGoalsForBodyType(
  bodyType: GoalBodyType | null | undefined,
  options?: { gender?: string | null; section?: GoalSection | 'all' }
): PlanGoalOption[] {
  const section = options?.section ?? 'all'
  return ALL_PLAN_GOAL_OPTIONS.filter((goal) => {
    if (options?.gender !== undefined && !isGoalVisibleForGender(goal, options.gender)) return false
    if (section === 'physique') return isPhysiqueGoal(goal)
    if (section === 'body') return !isPhysiqueGoal(goal) && goalMatchesBodyType(goal, bodyType)
    return goalMatchesBodyType(goal, bodyType)
  })
}

export function getUnlockedGoals(
  planSlug: string | null | undefined,
  gender?: string | null,
  bodyType?: GoalBodyType | null
): PlanGoalOption[] {
  return ALL_PLAN_GOAL_OPTIONS.filter(
    (goal) =>
      isGoalUnlockedForPlan(goal, planSlug) &&
      (gender === undefined || isGoalVisibleForGender(goal, gender)) &&
      (bodyType === undefined || goalMatchesBodyType(goal, bodyType))
  )
}

export function getLockedGoals(
  planSlug: string | null | undefined,
  gender?: string | null,
  bodyType?: GoalBodyType | null
): PlanGoalOption[] {
  return ALL_PLAN_GOAL_OPTIONS.filter(
    (goal) =>
      !isGoalUnlockedForPlan(goal, planSlug) &&
      (gender === undefined || isGoalVisibleForGender(goal, gender)) &&
      (bodyType === undefined || goalMatchesBodyType(goal, bodyType))
  )
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

export function formatGoalBodyTypeLabel(value: string | null | undefined): string {
  if (!value || !isValidGoalBodyType(value)) return 'Not set'
  return GOAL_BODY_TYPE_META[value].title
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
  planSlug: string | null | undefined,
  options?: { gender?: string | null; bodyType?: string | null; requireBodyType?: boolean }
): string | null {
  if (options?.requireBodyType) {
    if (!isValidGoalBodyType(options.bodyType)) {
      return 'Pick your starting point first (weight gain, skinny-fat, or lose fat fast).'
    }
  }

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

  if (options && 'gender' in options) {
    const genderBlocked = unique.filter((value) => !isGoalVisibleForGender(value, options.gender))
    if (genderBlocked.length > 0) {
      const first = getGoalByValue(genderBlocked[0])
      const required = first ? PLAN_GOAL_TIER_META[first.tier].title : 'a longer'
      const audience = first?.genders?.includes('female') && !first.genders.includes('male')
        ? 'women'
        : first?.genders?.includes('male') && !first.genders.includes('female')
          ? 'men'
          : 'your profile'
      return `“${formatPlanGoalLabel(genderBlocked[0])}” is available for ${audience} on the ${required} plan.`
    }
  }

  if (isValidGoalBodyType(options?.bodyType)) {
    const mismatched = unique.filter((value) => !goalMatchesBodyType(value, options.bodyType as GoalBodyType))
    if (mismatched.length > 0) {
      return `“${formatPlanGoalLabel(mismatched[0])}” doesn’t match your starting point. Pick goals from your category.`
    }
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

/** Best next upgrade target for locked goals the client can already see. */
export function suggestedUpgradeTier(
  planSlug: string | null | undefined,
  options?: { gender?: string | null; bodyType?: GoalBodyType | null }
): PlanGoalTier | null {
  const locked = getLockedGoals(planSlug, options?.gender, options?.bodyType)
  if (locked.length === 0) return null
  const ranks = locked.map((goal) => planTierRank(goal.tier)).filter((rank) => rank >= 0)
  if (ranks.length === 0) return null
  const minRank = Math.min(...ranks)
  return PLAN_GOAL_TIER_ORDER[minRank] ?? null
}
