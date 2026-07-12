'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  formatPlanCountdown,
  getExpectedPlanDeliveryDate,
  isPlanFullyReady,
} from '@/lib/purchase-dashboard'
import { colors, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile, Plan } from '@/types/database'

type PlanCountdownProps = {
  profile: OnboardingProfile
  activePlan: Plan | null
}

export function PlanCountdownCard({ profile, activePlan }: PlanCountdownProps) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(() => formatPlanCountdown(profile))

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatPlanCountdown(profile))
    }, 60_000)
    return () => clearInterval(timer)
  }, [profile])

  const planReady = isPlanFullyReady(activePlan, profile)

  if (!profile.onboarding_complete) return null

  if (planReady) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
          <CheckCircle2 size={24} color={colors.accent} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
              Your plan is ready.
            </p>
            <p style={{ margin: '6px 0 16px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
              Your coach has published your diet and workout plans.
            </p>
            <Button fullWidth onClick={() => router.push('/plan')}>
              Open My Plan
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (!profile.onboarding_complete || !profile.onboarding_completed_at) return null

  return (
    <Card variant="glass" style={{ marginBottom: spacing[4] }}>
      <div style={{
        borderTop: `2px solid ${colors.accent}`,
        margin: `-${spacing[4]}px -${spacing[4]}px ${spacing[3]}px`,
        paddingTop: spacing[4],
        borderRadius: '16px 16px 0 0',
      }} />
      <p style={{ margin: 0, fontSize: 15, color: colors.textSecondary, lineHeight: 1.6 }}>
        Your coach is preparing your personalized plan.
      </p>
      <p style={{ margin: '12px 0 4px', fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>
        Estimated delivery
      </p>
      <p style={{ margin: 0, fontSize: 14, color: colors.textSecondary }}>
        Within 48 hours.
      </p>
      {countdown && (
        <p style={{
          margin: '16px 0 0',
          fontSize: 22,
          fontWeight: 800,
          color: colors.accent,
          letterSpacing: '-0.02em',
        }}>
          {countdown}
        </p>
      )}
    </Card>
  )
}
