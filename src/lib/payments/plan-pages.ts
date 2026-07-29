import type { CoachingPlan, CoachingPlanSlug } from '@/lib/payments/plans'
import { COACHING_PLANS, getCoachingPlan } from '@/lib/payments/plans'

/** Public URL segment → catalog slug */
export const PLAN_PAGE_PATHS = {
  '3-months': '3_months',
  '6-months': '6_months',
  '12-months': '12_months',
} as const satisfies Record<string, CoachingPlanSlug>

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
  CoachingPlanSlug,
  { eyebrow: string; promise: string; bestFor: string }
> = {
  '3_months': {
    eyebrow: 'Momentum',
    promise:
      'Enough runway for real body change, with a coach adjusting every week — plus free Consistency League entry.',
    bestFor: 'People ready to commit and build lasting habits.',
  },
  '6_months': {
    eyebrow: 'Transformation',
    promise:
      'Deep coaching so plateaus get fixed — not abandoned. Free Consistency League entry included.',
    bestFor: 'Serious fat loss or rebuild goals that need consistency.',
  },
  '12_months': {
    eyebrow: 'Full Journey',
    promise:
      'A year of accountability at the lowest monthly rate — and the only plan that unlocks Crazy League prize money up to ₹5,000.',
    bestFor: 'Long-term change with best value and Crazy League eligibility.',
  },
}

export const PLAN_INCLUSIONS = [
  'Personal workout plan (gym, home, or both)',
  'Personal diet plan around your preferences & schedule',
  'Weekly coach check-ins with a real human coach',
  'Direct coach chat inside the app',
  'Daily trackers: workout, diet, water, sleep, steps, supplements',
  'Progress photos, measurements, and journey timeline',
  'Weekly plan updates based on your real progress',
  'Free Consistency League entry — climb for certificates & trophies',
] as const

export const PLAN_LEAGUE_CALLOUT = {
  title: 'Consistency League — included free',
  body:
    'Every coaching plan includes free league entry. Track, check in, climb for certificates and physical trophies. Crazy League — where top finishers can win prize money up to ₹5,000 — requires the 12-month plan.',
  twelveMonthExtra:
    'Your 12-month plan unlocks Crazy League eligibility for prize money up to ₹5,000 when you reach those tiers.',
} as const

export const ALL_PLAN_PAGE_PATHS = Object.keys(PLAN_PAGE_PATHS) as PlanPagePath[]

export function siblingPlans(current: CoachingPlanSlug): CoachingPlan[] {
  return (Object.values(COACHING_PLANS) as CoachingPlan[]).filter((plan) => plan.slug !== current)
}
