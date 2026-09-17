import { NextResponse } from 'next/server'
import {
  canAccessInstantFeature,
  INSTANT_FEATURE_LABEL,
  unlockHrefForFeature,
  type InstantFeature,
  type InstantFeatureProfile,
} from '@/lib/instant-feature-access'
import { latestCoachingPurchase, latestPurchasePlanSlug } from '@/lib/payments/digital-purchase'
import { createAdminClient } from '@/lib/supabase/admin'

export async function assertInstantFeatureAccess(
  userId: string,
  profile: InstantFeatureProfile,
  feature: InstantFeature
): Promise<NextResponse | null> {
  const admin = createAdminClient()
  const [coaching, planSlug] = await Promise.all([
    latestCoachingPurchase(admin, userId),
    latestPurchasePlanSlug(admin, userId),
  ])
  if (
    canAccessInstantFeature(profile, feature, {
      hasCoachingPurchase: Boolean(coaching),
      planSlug: coaching?.planSlug ?? planSlug,
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
