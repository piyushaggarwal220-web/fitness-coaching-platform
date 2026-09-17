import { NextResponse } from 'next/server'
import {
  canAccessInstantFeature,
  INSTANT_FEATURE_LABEL,
  unlockHrefForFeature,
  type InstantFeature,
  type InstantFeatureProfile,
} from '@/lib/instant-feature-access'
import {
  latestDigitalPurchase,
  latestCoachingPurchase,
} from '@/lib/payments/digital-purchase'
import { createAdminClient } from '@/lib/supabase/admin'

export async function assertInstantFeatureAccess(
  userId: string,
  profile: InstantFeatureProfile,
  feature: InstantFeature
): Promise<NextResponse | null> {
  const admin = createAdminClient()
  const [coaching, digital] = await Promise.all([
    latestCoachingPurchase(admin, userId),
    latestDigitalPurchase(admin, userId),
  ])
  const isInstantOnly = Boolean(digital) && !coaching
  if (
    canAccessInstantFeature(profile, feature, {
      hasCoachingPurchase: Boolean(coaching),
      planSlug: digital?.planSlug ?? coaching?.planSlug ?? null,
      isInstantOnly,
    })
  ) {
    return null
  }
  return NextResponse.json(
    {
      error: `${INSTANT_FEATURE_LABEL[feature]} is locked on your Instant plan. Unlock it for lifetime access.`,
      unlockHref: unlockHrefForFeature(feature),
      feature,
    },
    { status: 403 }
  )
}
