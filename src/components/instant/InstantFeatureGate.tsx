'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ClientShell } from '@/components/ui/ClientShell'
import { InstantFeatureLockedPanel } from '@/components/instant/InstantFeatureLockedPanel'
import {
  canAccessInstantFeature,
  type InstantFeature,
} from '@/lib/instant-feature-access'
import { createClient } from '@/lib/supabase/client'
import type { OnboardingProfile } from '@/types/database'

const supabase = createClient()

type Props = {
  feature: InstantFeature
  title: string
  children: ReactNode
}

/** Client-side gate for Instant-only locked surfaces. */
export function InstantFeatureGate({ feature, title, children }: Props) {
  const [state, setState] = useState<'loading' | 'allowed' | 'locked'>('loading')

  useEffect(() => {
    let active = true
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (active) setState('allowed')
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
          .limit(8),
      ])

      if (!active) return

      const row = profile as OnboardingProfile | null
      const coaching = (purchases ?? []).some(
        (p: { plan_slug?: string | null }) =>
          p.plan_slug &&
          !String(p.plan_slug).startsWith('digital_') &&
          !String(p.plan_slug).startsWith('unlock_') &&
          p.plan_slug !== 'exercise_library'
      )
      const planSlug =
        (purchases ?? []).find((p: { plan_slug?: string | null }) => p.plan_slug)?.plan_slug ?? null
      const allowed = canAccessInstantFeature(row, feature, {
        hasCoachingPurchase: coaching,
        planSlug,
      })
      setState(allowed ? 'allowed' : 'locked')
    }
    void run()
    return () => {
      active = false
    }
  }, [feature])

  if (state === 'loading') {
    return <ClientShell title={title} loading />
  }
  if (state === 'locked') {
    return (
      <ClientShell title={title}>
        <InstantFeatureLockedPanel feature={feature} />
      </ClientShell>
    )
  }
  return <>{children}</>
}
