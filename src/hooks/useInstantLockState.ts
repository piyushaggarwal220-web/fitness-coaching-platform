'use client'

import { useEffect, useState } from 'react'
import {
  canAccessInstantFeature,
  latestDigitalPlanSlug,
  purchaseRowsIndicateCoaching,
  purchaseRowsIndicateDigital,
  type InstantFeature,
} from '@/lib/instant-feature-access'
import { createClient } from '@/lib/supabase/client'
import type { OnboardingProfile } from '@/types/database'

const supabase = createClient()

export type InstantLockState = {
  loading: boolean
  isInstantOnly: boolean
  locked: Record<InstantFeature, boolean>
}

const OPEN: InstantLockState = {
  loading: false,
  isInstantOnly: false,
  locked: { tracker: false, journey: false, ai_chat: false },
}

/** Shared client hook so nav + pages hide Instant-locked surfaces. */
export function useInstantLockState(): InstantLockState {
  const [state, setState] = useState<InstantLockState>({
    loading: true,
    isInstantOnly: false,
    locked: { tracker: false, journey: false, ai_chat: false },
  })

  useEffect(() => {
    let active = true
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (active) setState(OPEN)
        return
      }

      const [{ data: profile }, { data: purchases }] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'instant_gates_enabled, addon_tracker_entitled, addon_journey_entitled, addon_ai_chat_entitled, access_source'
          )
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('purchases')
          .select('plan_slug, status')
          .eq('user_id', user.id)
          .eq('status', 'captured')
          .order('created_at', { ascending: false })
          .limit(12),
      ])

      if (!active) return

      const row = profile as OnboardingProfile | null
      const hasCoaching = purchaseRowsIndicateCoaching(purchases)
      const hasDigital = purchaseRowsIndicateDigital(purchases)
      const isInstantOnly = hasDigital && !hasCoaching
      const digitalSlug = latestDigitalPlanSlug(purchases)

      const locked = {
        tracker: !canAccessInstantFeature(row, 'tracker', {
          hasCoachingPurchase: hasCoaching,
          planSlug: digitalSlug,
          isInstantOnly,
        }),
        journey: !canAccessInstantFeature(row, 'journey', {
          hasCoachingPurchase: hasCoaching,
          planSlug: digitalSlug,
          isInstantOnly,
        }),
        ai_chat: !canAccessInstantFeature(row, 'ai_chat', {
          hasCoachingPurchase: hasCoaching,
          planSlug: digitalSlug,
          isInstantOnly,
        }),
      }

      setState({ loading: false, isInstantOnly, locked })
    }
    void run()
    return () => {
      active = false
    }
  }, [])

  return state
}
