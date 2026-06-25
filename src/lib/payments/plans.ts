export type CoachingPlanSlug = '1_month' | '3_months' | '6_months' | '12_months'

export type CoachingPlan = {
  slug: CoachingPlanSlug
  name: string
  displayPrice: string
  amountPaise: number
  durationMonths: number
  saveLabel: string
  popular?: boolean
  best?: boolean
}

/** Coaching plan catalog — amounts match landing page pricing. */
export const COACHING_PLANS: Record<CoachingPlanSlug, CoachingPlan> = {
  '1_month': {
    slug: '1_month',
    name: '1 Month',
    displayPrice: '₹500',
    amountPaise: 50000,
    durationMonths: 1,
    saveLabel: 'No commitment',
  },
  '3_months': {
    slug: '3_months',
    name: '3 Months',
    displayPrice: '₹900',
    amountPaise: 90000,
    durationMonths: 3,
    saveLabel: 'Save ₹600 vs monthly',
  },
  '6_months': {
    slug: '6_months',
    name: '6 Months',
    displayPrice: '₹1,500',
    amountPaise: 150000,
    durationMonths: 6,
    saveLabel: 'Save ₹1,500 vs monthly',
    popular: true,
  },
  '12_months': {
    slug: '12_months',
    name: '12 Months',
    displayPrice: '₹2,400',
    amountPaise: 240000,
    durationMonths: 12,
    saveLabel: 'Save ₹3,600 vs monthly',
    best: true,
  },
}

export const COACHING_PLAN_LIST = Object.values(COACHING_PLANS)

export function getCoachingPlan(slug: string | null | undefined): CoachingPlan | null {
  if (!slug || !(slug in COACHING_PLANS)) return null
  return COACHING_PLANS[slug as CoachingPlanSlug]
}

export function isValidPlanSlug(slug: string): slug is CoachingPlanSlug {
  return slug in COACHING_PLANS
}
