export type CoachingPlanSlug = '3_months' | '6_months' | '12_months' | '1_week_trial'

/** Historical slug kept for existing purchases / entitlements only. */
export type LegacyCoachingPlanSlug = '1_month'

export type AnyCoachingPlanSlug = CoachingPlanSlug | LegacyCoachingPlanSlug

export type CoachingPlan = {
  slug: AnyCoachingPlanSlug
  name: string
  displayPrice: string
  amountPaise: number
  /** Month-based duration; use 0 when `durationDays` is set. */
  durationMonths: number
  /** Day-based duration (e.g. trial). Prefer over months when set. */
  durationDays?: number
  saveLabel: string
  popular?: boolean
  best?: boolean
  /** Once-per-lifetime paid trial — not a long-term plan. */
  isTrial?: boolean
}

/** Active coaching plan catalog — amounts match storefront pricing. */
export const COACHING_PLANS: Record<CoachingPlanSlug, CoachingPlan> = {
  '1_week_trial': {
    slug: '1_week_trial',
    name: '7-Day All-Access Trial',
    displayPrice: '₹179',
    amountPaise: 17900,
    durationMonths: 0,
    durationDays: 7,
    saveLabel: 'All features · once per person',
    isTrial: true,
  },
  '3_months': {
    slug: '3_months',
    name: '3 Months',
    displayPrice: '₹4,249',
    amountPaise: 424900,
    durationMonths: 3,
    saveLabel: 'Quick Reset',
    popular: true,
  },
  '6_months': {
    slug: '6_months',
    name: '6 Months',
    displayPrice: '₹6,749',
    amountPaise: 674900,
    durationMonths: 6,
    saveLabel: 'Recomposition Starter',
  },
  '12_months': {
    slug: '12_months',
    name: '12 Months',
    displayPrice: '₹9,249',
    amountPaise: 924900,
    durationMonths: 12,
    saveLabel: 'Complete Transformation',
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

/** Long plans shown on main checkout (excludes trial). */
export const COACHING_PLAN_LIST = Object.values(COACHING_PLANS).filter((p) => !p.isTrial)

export const TRIAL_PLAN = COACHING_PLANS['1_week_trial']

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

export function isTrialPlanSlug(slug: string | null | undefined): boolean {
  return slug === '1_week_trial'
}

/** Compute subscription end from plan duration (days preferred when set). */
export function subscriptionExpiryFromPlan(plan: CoachingPlan, from = new Date()): Date {
  const expiry = new Date(from.getTime())
  if (plan.durationDays && plan.durationDays > 0) {
    expiry.setTime(expiry.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
    return expiry
  }
  expiry.setMonth(expiry.getMonth() + plan.durationMonths)
  return expiry
}
