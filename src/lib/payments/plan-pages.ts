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
    eyebrow: 'Short deadline',
    goalName: 'Fat loss',
    durationLabel: '90 days',
    promise:
      'Built for a date on the calendar — a wedding, a vacation, a shoot, a reunion. Ninety days is a short runway to look visibly leaner and sharper for the event. It is a focused sprint, not the finished aesthetic look.',
    bestFor:
      'Lean for a wedding, shoot, or reunion. Short-term only — not built for lasting change.',
    goals: [
      'Look visibly leaner for your event',
      'A clear day-by-day plan to the deadline',
      'First visible change in 90 days',
    ],
  },
  '6_months': {
    eyebrow: 'Goal plan',
    goalName: 'Fat loss + muscle',
    durationLabel: '6 months',
    promise:
      'This plan is for fat down and muscle up together. Six months is strong progress — not the full aesthetic finish. Upgrade free within 48 hours if you want the longer runway.',
    bestFor:
      'You already train and want fat down + muscle up. A recomp block — not a first start.',
    goals: ['Fat loss with muscle', 'Clothes fit differently', 'Stay consistent past the honeymoon phase'],
  },
  '12_months': {
    eyebrow: 'Recommended',
    goalName: 'Aesthetic body',
    durationLabel: '12 months',
    promise:
      'This is the recommended plan if you want a body you are proud of long term. Lowest monthly rate, weekly coach phone call, and a full year so you do not restart every 90 days.',
    bestFor:
      'Beginners and intermediates — someone who has hit a plateau, or who wants to start fresh and actually finish the look.',
    goals: [
      'Aesthetic physique change',
      'Lowest monthly rate with WELCOME60',
      'Weekly coach phone call (12 month exclusive)',
    ],
  },
}

export function planGoalName(slug: AnyCoachingPlanSlug | string): string {
  if (slug === '1_week_trial') return 'Trial'
  if (slug === '1_month') return '1 month'
  return PLAN_PAGE_COPY[slug as LongCoachingPlanSlug]?.goalName ?? 'Coaching'
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
    group: 'Opens with fat loss',
    label: 'Best for',
    cells: {
      '3_months': 'Lean for a big day. Short-term only.',
      '6_months': 'Already training. Recomp block.',
      '12_months': 'Beginners and intermediates who have plateaued, or want to start fresh.',
    },
  },
  {
    group: 'Opens with fat loss',
    label: 'Core coaching',
    hint: 'Workout, diet, coach chat, 2 check ins, trackers, photos. First plan in 24 to 48 hours.',
    cells: { ...YES },
  },
  {
    group: 'Opens with fat loss',
    label: 'Plan updates',
    cells: { '3_months': 'Every 14 days', '6_months': 'Every week', '12_months': 'Every week' },
  },
  {
    group: 'More with fat loss + muscle',
    label: 'Fuller coaching stack',
    hint: 'Weekly plan updates, cardio, supplements, journey, plateau coaching past 90 days.',
    cells: { ...FROM_6 },
  },
  {
    group: 'Everything with aesthetic',
    label: 'Weekly coach phone call',
    cells: { ...FROM_12 },
  },
  {
    group: 'Everything with aesthetic',
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
