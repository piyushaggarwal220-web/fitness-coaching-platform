export type CoachingPlanSlug = '3_months' | '6_months' | '12_months'

/** Historical slug kept for existing purchases / entitlements only. */
export type LegacyCoachingPlanSlug = '1_month'

export type AnyCoachingPlanSlug = CoachingPlanSlug | LegacyCoachingPlanSlug

export type CoachingPlan = {
  slug: AnyCoachingPlanSlug
  name: string
  displayPrice: string
  amountPaise: number
  durationMonths: number
  saveLabel: string
  popular?: boolean
  best?: boolean
}

/** Active coaching plan catalog — amounts match storefront pricing. */
export const COACHING_PLANS: Record<CoachingPlanSlug, CoachingPlan> = {
  '3_months': {
    slug: '3_months',
    name: '3 Months',
    displayPrice: '₹999',
    amountPaise: 99900,
    durationMonths: 3,
    saveLabel: 'Best starter plan',
    popular: true,
  },
  '6_months': {
    slug: '6_months',
    name: '6 Months',
    displayPrice: '₹1,699',
    amountPaise: 169900,
    durationMonths: 6,
    saveLabel: 'Save ₹299 vs two 3-month plans',
  },
  '12_months': {
    slug: '12_months',
    name: '12 Months',
    displayPrice: '₹2,999',
    amountPaise: 299900,
    durationMonths: 12,
    saveLabel: 'Save ₹999 vs four 3-month plans',
    best: true,
  },
}

/** Retired plans — still resolve for existing subscriptions and redemption history. */
export const LEGACY_COACHING_PLANS: Record<LegacyCoachingPlanSlug, CoachingPlan> = {
  '1_month': {
    slug: '1_month',
    name: '1 Month',
    displayPrice: '₹499',
    amountPaise: 49900,
    durationMonths: 1,
    saveLabel: 'No commitment',
  },
}

export const COACHING_PLAN_LIST = Object.values(COACHING_PLANS)

export function getCoachingPlan(slug: string | null | undefined): CoachingPlan | null {
  if (!slug) return null
  if (slug in COACHING_PLANS) return COACHING_PLANS[slug as CoachingPlanSlug]
  if (slug in LEGACY_COACHING_PLANS) return LEGACY_COACHING_PLANS[slug as LegacyCoachingPlanSlug]
  return null
}

/** Purchasable plans only — rejects retired slugs like `1_month`. */
export function getPurchasablePlan(slug: string | null | undefined): CoachingPlan | null {
  if (!slug || !(slug in COACHING_PLANS)) return null
  return COACHING_PLANS[slug as CoachingPlanSlug]
}

export function isValidPlanSlug(slug: string): slug is CoachingPlanSlug {
  return slug in COACHING_PLANS
}
