import type { AnyCoachingPlanSlug, CoachingPlan, CoachingPlanSlug } from '@/lib/payments/plans'
import { COACHING_PLAN_LIST, COACHING_PLANS, getCoachingPlan } from '@/lib/payments/plans'

/** Public marketing plan pages (excludes trial). */
export type LongCoachingPlanSlug = Exclude<CoachingPlanSlug, '1_week_trial'>

/** Public URL segment → catalog slug */
export const PLAN_PAGE_PATHS = {
  '3-months': '3_months',
  '6-months': '6_months',
  '12-months': '12_months',
} as const satisfies Record<string, LongCoachingPlanSlug>

export type PlanPagePath = keyof typeof PLAN_PAGE_PATHS

/** Retired public paths that should redirect to the current starter plan. */
export const RETIRED_PLAN_PAGE_REDIRECTS: Record<string, PlanPagePath> = {
  '1-month': '3-months',
}

export function planPathForSlug(slug: CoachingPlanSlug): PlanPagePath {
  const entry = Object.entries(PLAN_PAGE_PATHS).find(([, value]) => value === slug)
  return (entry?.[0] as PlanPagePath) ?? '3-months'
}

export function resolvePlanFromPath(pathSlug: string | undefined): CoachingPlan | null {
  if (!pathSlug) return null
  const catalogSlug = PLAN_PAGE_PATHS[pathSlug as PlanPagePath]
  if (!catalogSlug) return null
  return getCoachingPlan(catalogSlug)
}

/** Customer-facing product names. Duration is secondary. */
export const PLAN_PRODUCT_NAME: Record<LongCoachingPlanSlug, string> = {
  '3_months': 'Fat loss',
  '6_months': 'Get Lean & Toned',
  '12_months': 'Build Your Dream Body',
}

export const PLAN_PAGE_COPY: Record<
  LongCoachingPlanSlug,
  {
    eyebrow: string
    promise: string
    bestFor: string
    goalName: string
    durationLabel: string
    goals: string[]
  }
> = {
  '3_months': {
    eyebrow: 'Fat loss',
    goalName: PLAN_PRODUCT_NAME['3_months'],
    durationLabel: '90 days',
    promise:
      'This is the Fat loss plan. Ninety days to drop fat fast and look sharp. If you want Get Lean & Toned, that is 6 months. If you want to Build Your Dream Body, that is 12 months, with a weekly coach phone call included.',
    bestFor: 'dropping fat fast and looking sharp — results in 90 days',
    goals: [
      'Fat loss in 90 days',
      'A clear diet and workout plan',
      'Coach check-ins twice a week',
    ],
  },
  '6_months': {
    eyebrow: 'Get Lean & Toned',
    goalName: PLAN_PRODUCT_NAME['6_months'],
    durationLabel: '6 months',
    promise:
      'Get Lean & Toned. Six months to build a lean, athletic body with visible muscle tone. To Build Your Dream Body, that is 12 months, with a weekly coach phone call included.',
    bestFor: 'building a lean, athletic body with visible muscle tone',
    goals: [
      'Get Lean & Toned',
      'Clothes fit smaller and tighter',
      'Weekly plan updates',
    ],
  },
  '12_months': {
    eyebrow: 'Build Your Dream Body',
    goalName: PLAN_PRODUCT_NAME['12_months'],
    durationLabel: '12 months',
    promise:
      'Build Your Dream Body is 12 months, with a weekly coach phone call included. A full year so fat loss and muscle can both show as a finished look. Lowest monthly rate.',
    bestFor: 'a full body transformation with the most complete coaching experience',
    goals: [
      'Build Your Dream Body',
      'Lowest monthly rate with WELCOME60',
      'Weekly coach phone call included',
    ],
  },
}

export function planGoalName(slug: AnyCoachingPlanSlug | string): string {
  if (slug === '1_week_trial') return 'Trial'
  if (slug === '1_month') return '1 month'
  return PLAN_PRODUCT_NAME[slug as LongCoachingPlanSlug] ?? 'Coaching'
}

export function planDurationLabel(slug: AnyCoachingPlanSlug | string): string {
  if (slug === '1_week_trial') return '7 days'
  if (slug === '1_month') return '1 month'
  return PLAN_PAGE_COPY[slug as LongCoachingPlanSlug]?.durationLabel ?? ''
}

export type PlanCompareCell = boolean | string

const YES = { '3_months': true, '6_months': true, '12_months': true } as const
const FROM_6 = { '3_months': false, '6_months': true, '12_months': true } as const
const FROM_12 = { '3_months': false, '6_months': false, '12_months': true } as const

export const PLAN_COMPARE_ROWS: {
  group: string
  label: string
  hint?: string
  cells: Record<LongCoachingPlanSlug, PlanCompareCell>
}[] = [
  {
    group: 'Opens with debloat',
    label: 'Best for',
    cells: {
      '3_months': 'Dropping fat fast and looking sharp — results in 90 days',
      '6_months': 'Building a lean, athletic body with visible muscle tone',
      '12_months': 'A full body transformation with the most complete coaching experience',
    },
  },
  {
    group: 'Opens with debloat',
    label: 'Core coaching',
    hint: 'Workout, diet, coach chat, 2 check ins, trackers, photos. First plan in 24 to 48 hours.',
    cells: { ...YES },
  },
  {
    group: 'Opens with debloat',
    label: 'Plan updates',
    cells: { '3_months': 'Every 14 days', '6_months': 'Every week', '12_months': 'Every week' },
  },
  {
    group: 'More with fat loss',
    label: 'Fuller coaching stack',
    hint: 'Weekly plan updates, cardio, supplements, journey, plateau coaching past 90 days.',
    cells: { ...FROM_6 },
  },
  {
    group: 'Everything with Get Lean & Toned',
    label: 'Weekly coach phone call',
    cells: { ...FROM_12 },
  },
  {
    group: 'Everything with Get Lean & Toned',
    label: 'Lowest monthly rate',
    hint: 'Full year accountability.',
    cells: { ...FROM_12 },
  },
  {
    group: 'Value',
    label: 'Upgrade within 48 hours',
    hint: 'Free upgrade within 48 hours of taking your plan. After 48 hours, upgrades cost ₹250 extra.',
    cells: { ...YES },
  },
  {
    group: 'Value',
    label: 'Per month with WELCOME60',
    cells: { '3_months': '₹433', '6_months': '₹350', '12_months': '₹292' },
  },
]

export const PLAN_INCLUSIONS = [
  'Personal workout plan (gym, home, or both)',
  'Personal diet plan around your food and schedule',
  'Human coach in the app. A real person owns your case',
  'Mid week + weekly check ins',
  'Daily trackers: workout, meals, water, sleep, steps, habits',
  'Journey + progress photos',
] as const

export const ALL_PLAN_PAGE_PATHS = Object.keys(PLAN_PAGE_PATHS) as PlanPagePath[]

export function siblingPlans(current: CoachingPlanSlug): CoachingPlan[] {
  return COACHING_PLAN_LIST.filter((plan) => plan.slug !== current)
}

/** @deprecated Prefer COACHING_PLAN_LIST — kept for callers that imported COACHING_PLANS via this module. */
export { COACHING_PLANS }
