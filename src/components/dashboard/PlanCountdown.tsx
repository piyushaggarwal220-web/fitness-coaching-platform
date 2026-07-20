'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  PLAN_DELIVERY_HOURS,
  formatPlanCountdown,
  hasOpenedDietAndWorkout,
  isPlanFullyReady,
} from '@/lib/purchase-dashboard'
import { colors, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile, Plan } from '@/types/database'

type PlanCountdownProps = {
  profile: OnboardingProfile
  activePlan: Plan | null
  coachName?: string | null
}

export function PlanCountdownCard({ profile, activePlan, coachName }: PlanCountdownProps) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(() => formatPlanCountdown(profile))

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatPlanCountdown(profile))
    }, 30_000)
    return () => clearInterval(timer)
  }, [profile])

  const planReady = isPlanFullyReady(activePlan, profile)
  const openedCore = hasOpenedDietAndWorkout(activePlan)
  const displayCoach = coachName?.trim() || 'Your coach'

  // Once diet + workout have been opened, leave the upper slot for the tracker.
  if (planReady && openedCore) return null

  // Payment done + coach assigned, but onboarding not finished yet
  if (profile.coach_id && !profile.onboarding_complete) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <CoachAssignedHeader coachName={displayCoach} />
        <p style={{ margin: '12px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.55 }}>
          Complete onboarding so {displayCoach.split(' ')[0]} can build your personal diet and workout.
          Your plan is delivered within {PLAN_DELIVERY_HOURS} hours after onboarding.
        </p>
        <Button fullWidth style={{ marginTop: 16 }} onClick={() => router.push('/onboarding')}>
          Continue onboarding
        </Button>
      </Card>
    )
  }

  if (!profile.onboarding_complete) return null

  if (planReady) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
          <CheckCircle2 size={24} color={colors.accent} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
              Your plan is ready
            </p>
            <p style={{ margin: '6px 0 4px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
              {displayCoach} published your diet and workout. Open both sections to unlock your daily tracker focus.
            </p>
            <Button fullWidth style={{ marginTop: 12 }} onClick={() => router.push('/plan')}>
              Open diet & workout
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (!profile.coach_id) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
          Assigning your coach
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          You&apos;ll see your coach&apos;s name here shortly. Plan delivery starts after onboarding.
        </p>
      </Card>
    )
  }

  if (!profile.onboarding_completed_at) return null

  return (
    <Card variant="glass" style={{ marginBottom: spacing[4] }}>
      <div style={{
        borderTop: `2px solid ${colors.accent}`,
        margin: `-${spacing[4]}px -${spacing[4]}px ${spacing[3]}px`,
        paddingTop: spacing[4],
        borderRadius: '16px 16px 0 0',
      }} />
      <CoachAssignedHeader coachName={displayCoach} />
      <p style={{ margin: '12px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.55 }}>
        {displayCoach} is preparing your personalized diet and workout plan.
      </p>
      <p style={{ margin: '14px 0 4px', fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>
        Estimated delivery
      </p>
      <p style={{ margin: 0, fontSize: 14, color: colors.textSecondary }}>
        Within {PLAN_DELIVERY_HOURS} hours
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

function CoachAssignedHeader({ coachName }: { coachName: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: colors.accentMuted,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <UserRound size={22} color={colors.accent} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: colors.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Coach assigned
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.02em' }}>
          {coachName}
        </p>
      </div>
    </div>
  )
}
