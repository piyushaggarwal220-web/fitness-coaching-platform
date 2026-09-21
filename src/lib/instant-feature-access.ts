import { isDigitalPlanSlug } from '@/lib/payments/plans'

export type InstantFeature = 'tracker' | 'journey' | 'ai_chat'

export type InstantFeatureProfile = {
  instant_gates_enabled?: boolean | null
  addon_tracker_entitled?: boolean | null
  addon_journey_entitled?: boolean | null
  addon_ai_chat_entitled?: boolean | null
  access_source?: string | null
}

export const INSTANT_FEATURE_UNLOCK_HREF: Record<InstantFeature, string> = {
  tracker: '/unlock?feature=tracker',
  journey: '/unlock?feature=journey',
  ai_chat: '/unlock?feature=ai_chat',
}

export const INSTANT_FEATURE_LABEL: Record<InstantFeature, string> = {
  tracker: 'Daily tracker',
  journey: 'Journey',
  ai_chat: 'Coach chat',
}

/** Non-membership purchase rows (unlocks / library) — not coaching. */
export function isPlatformAddonPlanSlug(slug: string | null | undefined): boolean {
  if (!slug) return false
  return slug.startsWith('unlock_') || slug === 'exercise_library'
}

export function isCoachingPlanSlug(slug: string | null | undefined): boolean {
  if (!slug) return false
  if (isDigitalPlanSlug(slug) || isPlatformAddonPlanSlug(slug)) return false
  return true
}

export function purchaseRowsIndicateCoaching(
  purchases: Array<{ plan_slug?: string | null }> | null | undefined
): boolean {
  return (purchases ?? []).some((p) => isCoachingPlanSlug(p.plan_slug))
}

export function purchaseRowsIndicateDigital(
  purchases: Array<{ plan_slug?: string | null }> | null | undefined
): boolean {
  return (purchases ?? []).some((p) => isDigitalPlanSlug(p.plan_slug))
}

/** Prefer a digital SKU when classifying Instant-only access. */
export function latestDigitalPlanSlug(
  purchases: Array<{ plan_slug?: string | null }> | null | undefined
): string | null {
  for (const p of purchases ?? []) {
    if (isDigitalPlanSlug(p.plan_slug)) return p.plan_slug as string
  }
  return null
}

/** Orange / trial / enrollment always include platform features. */
export function coachingIncludesInstantFeatures(
  planSlug: string | null | undefined,
  accessSource?: string | null
): boolean {
  if (accessSource === 'admin_trial' || accessSource === 'enrollment_code') return true
  return isCoachingPlanSlug(planSlug)
}

export function isInstantFeatureEntitled(
  profile: InstantFeatureProfile | null | undefined,
  feature: InstantFeature
): boolean {
  if (!profile) return false
  if (feature === 'tracker') return profile.addon_tracker_entitled === true
  if (feature === 'journey') return profile.addon_journey_entitled === true
  return profile.addon_ai_chat_entitled === true
}

/**
 * Instant-only buyers must unlock tracker / journey / coach chat (lifetime ₹99 / ₹199).
 * Coaching membership, trial, and enrollment include everything.
 * Default deny — never open platform features unless coaching or entitled.
 */
export function canAccessInstantFeature(
  profile: InstantFeatureProfile | null | undefined,
  feature: InstantFeature,
  options?: {
    planSlug?: string | null
    hasCoachingPurchase?: boolean
    /** When true, treat as Instant-only even if planSlug is an unlock_* row. */
    isInstantOnly?: boolean
  }
): boolean {
  if (!profile) return false
  if (
    profile.access_source === 'admin_trial' ||
    profile.access_source === 'enrollment_code'
  ) {
    return true
  }

  const instantOnly =
    options?.isInstantOnly === true ||
    isDigitalPlanSlug(options?.planSlug) ||
    profile.instant_gates_enabled === true

  // Instant digital buyers stay gated even if an old redeemed coaching row exists.
  if (instantOnly) {
    return isInstantFeatureEntitled(profile, feature)
  }

  if (options?.hasCoachingPurchase) return true
  if (coachingIncludesInstantFeatures(options?.planSlug, profile.access_source)) {
    return true
  }

  return isInstantFeatureEntitled(profile, feature)
}

export function unlockHrefForFeature(feature: InstantFeature): string {
  return INSTANT_FEATURE_UNLOCK_HREF[feature]
}
