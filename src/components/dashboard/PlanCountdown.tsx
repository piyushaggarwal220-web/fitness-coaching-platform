'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { isAutoDeliveryCoach } from '@/lib/coach-delivery-policy'
import { INSTANT_PLAN_WINDOW_LABEL } from '@/lib/plan-delivery-window'
import {
  PLAN_DELIVERY_HOURS,
  formatPlanCountdown,
  hasOpenedDietAndWorkout,
  isPlanFullyReady,
} from '@/lib/purchase-dashboard'
import { digitalPlanSections, isDigitalPlanSlug } from '@/lib/payments/plans'
import { absentPlanCopy, livePlanSectionDetail } from '@/lib/client-plan-presence'
import { clientColors as colors, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile, Plan } from '@/types/database'

function coachingReadyLine(plan: Plan | null): string {
  const diet = Boolean(plan?.nutrition_plan?.trim())
  const workout = Boolean(plan?.workout_plan?.trim())
  if (diet && workout) {
    return 'Diet and workout are in My Plan. Open both sections to unlock your daily tracker focus.'
  }
  return livePlanSectionDetail({ hasDiet: diet, hasWorkout: workout, planDelivered: true })
}

type PlanCountdownProps = {
  profile: OnboardingProfile
  activePlan: Plan | null
  coachName?: string | null
  coachBio?: string | null
  coachPhotoPath?: string | null
  planSlug?: string | null
  generationStatus?: string | null
}

export function PlanCountdownCard({
  profile,
  activePlan,
  planSlug,
  generationStatus,
}: PlanCountdownProps) {
  const router = useRouter()
  const isDigital = isDigitalPlanSlug(planSlug)
  const sections = digitalPlanSections(planSlug)
  const [countdown, setCountdown] = useState(() =>
    formatPlanCountdown(profile, { digital: isDigital })
  )

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatPlanCountdown(profile, { digital: isDigital }))
    }, 30_000)
    return () => clearInterval(timer)
  }, [profile, isDigital])

  const planReady = isPlanFullyReady(activePlan, profile, { sections })
  const openedCore = isDigital
    ? sections === 'workout'
      ? Boolean(activePlan?.workout_opened_at)
      : sections === 'diet'
        ? Boolean(activePlan?.diet_opened_at)
        : hasOpenedDietAndWorkout(activePlan)
    : hasOpenedDietAndWorkout(activePlan)
  const displayCoach = 'Smart Coach'
  const instantWindow = isDigital || isAutoDeliveryCoach(profile.coach_id)
  const deliveryWindowLabel = instantWindow
    ? INSTANT_PLAN_WINDOW_LABEL
    : `${PLAN_DELIVERY_HOURS} hours`

  // Once diet + workout have been opened, leave the upper slot for the tracker.
  if (planReady && openedCore) return null

  // Payment done, but onboarding not finished yet
  if (!profile.onboarding_complete && (profile.coach_id || isDigital)) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        {!isDigital ? (
          <CoachAssignedHeader coachName={displayCoach} />
        ) : (
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
            Finish setup for your customised plan
          </p>
        )}
        <p style={{ margin: '12px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.55 }}>
          {`Complete onboarding. Your diet and workout show up in My Plan within ${deliveryWindowLabel} after that.`}
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
              {isDigital
                ? 'Your customised plan is ready. Open it in the app — we also emailed you a link.'
                : coachingReadyLine(activePlan)}
            </p>
            <Button fullWidth style={{ marginTop: 12 }} onClick={() => router.push('/plan')}>
              {isDigital ? 'Open your plan' : 'Open My Plan'}
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (!profile.coach_id && !isDigital) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
          Finish setup
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          Your plan shows up in My Plan after onboarding.
        </p>
      </Card>
    )
  }

  if (!profile.onboarding_completed_at) return null

  const absent = absentPlanCopy({
    jobStatus: generationStatus,
    planDelivered: profile.plan_delivered === true,
    instant: instantWindow,
    windowLabel: INSTANT_PLAN_WINDOW_LABEL,
  })
  if (!absent.inProgress) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
          {absent.headline}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          {absent.detail}
        </p>
      </Card>
    )
  }

  if (isDigital) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
          {absent.headline}
        </p>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.55 }}>
          {absent.detail}
        </p>
        <p style={{ margin: '14px 0 4px', fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>
          Estimated delivery
        </p>
        <p style={{ margin: 0, fontSize: 14, color: colors.textSecondary }}>
          Within {deliveryWindowLabel}
        </p>
        {countdown && (
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 22,
              fontWeight: 800,
              color: colors.accent,
              letterSpacing: '-0.02em',
            }}
          >
            {countdown}
          </p>
        )}
      </Card>
    )
  }

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
        {absent.detail}
      </p>
      <p style={{ margin: '14px 0 4px', fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>
        Estimated delivery
      </p>
      <p style={{ margin: 0, fontSize: 14, color: colors.textSecondary }}>
        Within {deliveryWindowLabel}
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

function CoachAssignedHeader({
  coachName,
  photoUrl,
}: {
  coachName: string
  photoUrl?: string | null
  bio?: string | null
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: colors.accentMuted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <UserRound size={22} color={colors.accent} />
        )}
      </div>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
          {coachName}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.textMuted }}>Smart Coach</p>
      </div>
    </div>
  )
}
