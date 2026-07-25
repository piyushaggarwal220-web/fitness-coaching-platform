import type { CoachingPlan, CoachingPlanSlug } from '@/lib/payments/plans'
import { COACHING_PLANS, getCoachingPlan } from '@/lib/payments/plans'

/** Public URL segment → catalog slug */
export const PLAN_PAGE_PATHS = {
  '1-month': '1_month',
  '3-months': '3_months',
  '6-months': '6_months',
  '12-months': '12_months',
} as const satisfies Record<string, CoachingPlanSlug>

export type PlanPagePath = keyof typeof PLAN_PAGE_PATHS

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
  '1_month': {
    eyebrow: 'The Foundation',
    promise: 'Start with a full coaching month — personal plan, weekly reviews, and daily tracking.',
    bestFor: 'Trying coaching for the first time or testing the fit.',
  },
  '3_months': {
    eyebrow: 'Momentum',
    promise: 'Enough runway for real body change, with a coach adjusting every week.',
    bestFor: 'People ready to commit and build lasting habits.',
  },
  '6_months': {
    eyebrow: 'Transformation',
    promise: 'Deep coaching so plateaus get fixed — not abandoned.',
    bestFor: 'Serious fat loss or rebuild goals that need consistency.',
  },
  '12_months': {
    eyebrow: 'Full Journey',
    promise: 'A year of accountability at the lowest monthly rate.',
    bestFor: 'Long-term change with the best value per month.',
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
] as const

export const ALL_PLAN_PAGE_PATHS = Object.keys(PLAN_PAGE_PATHS) as PlanPagePath[]

export function siblingPlans(current: CoachingPlanSlug): CoachingPlan[] {
  return Object.values(COACHING_PLANS).filter((plan) => plan.slug !== current)
}
