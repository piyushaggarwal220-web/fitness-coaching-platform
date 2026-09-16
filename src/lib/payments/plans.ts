export type CoachingPlanSlug = '3_months' | '6_months' | '12_months'

/** Historical slugs kept for existing purchases / entitlements only. */
export type LegacyCoachingPlanSlug = '1_month' | '1_week_trial'

/** One-time customised digital plans (Instant Plan product line). */
export type DigitalPlanSlug = 'digital_workout' | 'digital_diet' | 'digital_complete'

export type AnyCoachingPlanSlug = CoachingPlanSlug | LegacyCoachingPlanSlug
export type AnyProductPlanSlug = AnyCoachingPlanSlug | DigitalPlanSlug

export type DigitalPlanSections = 'workout' | 'diet' | 'both'

export type CoachingPlan = {
  slug: AnyProductPlanSlug
  name: string
  displayPrice: string
  amountPaise: number
  /** Month-based duration; use 0 when `durationDays` is set. */
  durationMonths: number
  /** Day-based duration (e.g. retired trial / digital access window). Prefer over months when set. */
  durationDays?: number
  saveLabel: string
  popular?: boolean
  best?: boolean
  /** Retired paid trial — not purchasable. */
  isTrial?: boolean
  /** One time customised digital plan (coach principles, auto delivery). */
  isDigital?: boolean
  /** Which sections to generate/deliver for digital SKUs. */
  sections?: DigitalPlanSections
}

/** Active coaching plan catalog — amounts match storefront pricing. */
export const COACHING_PLANS: Record<CoachingPlanSlug, CoachingPlan> = {
  '3_months': {
    slug: '3_months',
    name: 'Fat loss',
    displayPrice: '₹1,999',
    amountPaise: 199900,
    durationMonths: 3,
    saveLabel: 'Fat loss',
  },
  '6_months': {
    slug: '6_months',
    name: 'Fat loss + muscle gain',
    displayPrice: '₹3,499',
    amountPaise: 349900,
    durationMonths: 6,
    saveLabel: 'Fat loss + muscle gain',
    popular: true,
  },
  '12_months': {
    slug: '12_months',
    name: 'Athletic body',
    displayPrice: '₹5,999',
    amountPaise: 599900,
    durationMonths: 12,
    saveLabel: 'Athletic body',
    best: true,
  },
}

/**
 * Customised digital plans (workout ₹49 / diet ₹89 / complete ₹99).
 * Honest list prices only. Access window: 365 days to reopen the plan in app.
 */
export const DIGITAL_PLANS: Record<DigitalPlanSlug, CoachingPlan> = {
  digital_workout: {
    slug: 'digital_workout',
    name: 'Workout Plan',
    displayPrice: '₹49',
    amountPaise: 4900,
    durationMonths: 0,
    durationDays: 365,
    saveLabel: 'Workout only',
    isDigital: true,
    sections: 'workout',
  },
  digital_diet: {
    slug: 'digital_diet',
    name: 'Diet Plan',
    displayPrice: '₹89',
    amountPaise: 8900,
    durationMonths: 0,
    durationDays: 365,
    saveLabel: 'Diet only',
    isDigital: true,
    sections: 'diet',
  },
  digital_complete: {
    slug: 'digital_complete',
    name: 'Complete Guidance',
    displayPrice: '₹99',
    amountPaise: 9900,
    durationMonths: 0,
    durationDays: 365,
    saveLabel: 'Best value',
    popular: true,
    isDigital: true,
    sections: 'both',
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
}

export const COACHING_PLAN_LIST = Object.values(COACHING_PLANS)
/** Display order: singles on the sides, Complete featured in the centre. */
export const DIGITAL_PLAN_LIST = [
  DIGITAL_PLANS.digital_workout,
  DIGITAL_PLANS.digital_complete,
  DIGITAL_PLANS.digital_diet,
]

export function isDigitalPlanSlug(slug: string | null | undefined): slug is DigitalPlanSlug {
  return Boolean(slug && slug in DIGITAL_PLANS)
}

export function getDigitalPlan(slug: string | null | undefined): CoachingPlan | null {
  if (!slug || !(slug in DIGITAL_PLANS)) return null
  return DIGITAL_PLANS[slug as DigitalPlanSlug]
}

export function getCoachingPlan(slug: string | null | undefined): CoachingPlan | null {
  if (!slug) return null
  if (slug in COACHING_PLANS) return COACHING_PLANS[slug as CoachingPlanSlug]
  if (slug in DIGITAL_PLANS) return DIGITAL_PLANS[slug as DigitalPlanSlug]
  if (slug in LEGACY_COACHING_PLANS) return LEGACY_COACHING_PLANS[slug as LegacyCoachingPlanSlug]
  return null
}

/** Purchasable plans — coaching 3/6/12 + digital customised SKUs. */
export function getPurchasablePlan(slug: string | null | undefined): CoachingPlan | null {
  if (!slug) return null
  if (slug in COACHING_PLANS) return COACHING_PLANS[slug as CoachingPlanSlug]
  if (slug in DIGITAL_PLANS) return DIGITAL_PLANS[slug as DigitalPlanSlug]
  return null
}

export function isValidPlanSlug(slug: string): slug is CoachingPlanSlug {
  return slug in COACHING_PLANS
}

export function isValidPurchasableSlug(slug: string): boolean {
  return slug in COACHING_PLANS || slug in DIGITAL_PLANS
}

export function isTrialPlanSlug(slug: string | null | undefined): boolean {
  return slug === '1_week_trial'
}

export function digitalPlanSections(slug: string | null | undefined): DigitalPlanSections | null {
  const plan = getDigitalPlan(slug)
  return plan?.sections ?? null
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
