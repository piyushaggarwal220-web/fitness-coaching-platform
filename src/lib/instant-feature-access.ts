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
  ai_chat: 'AI coach chat',
}

/** Orange / trial / enrollment always include platform features. */
export function coachingIncludesInstantFeatures(
  planSlug: string | null | undefined,
  accessSource?: string | null
): boolean {
  if (accessSource === 'admin_trial' || accessSource === 'enrollment_code') return true
  if (!planSlug) return false
  return !isDigitalPlanSlug(planSlug)
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
 * Instant gates only apply when enabled on the profile (new digital claims).
 * Coaching / trial / enrollment / grandfathered Instant → open.
 */
export function canAccessInstantFeature(
  profile: InstantFeatureProfile | null | undefined,
  feature: InstantFeature,
  options?: { planSlug?: string | null; hasCoachingPurchase?: boolean }
): boolean {
  if (!profile) return false
  if (options?.hasCoachingPurchase) return true
  if (coachingIncludesInstantFeatures(options?.planSlug, profile.access_source)) return true
  if (!profile.instant_gates_enabled) return true
  return isInstantFeatureEntitled(profile, feature)
}

export function unlockHrefForFeature(feature: InstantFeature): string {
  return INSTANT_FEATURE_UNLOCK_HREF[feature]
}
