'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  DIGITAL_PLAN_DELIVERY_HOURS,
  PLAN_DELIVERY_HOURS,
  formatPlanCountdown,
  hasOpenedDietAndWorkout,
  isPlanFullyReady,
} from '@/lib/purchase-dashboard'
import { digitalPlanSections, isDigitalPlanSlug } from '@/lib/payments/plans'
import { colors, spacing } from '@/lib/design-tokens'
import { createClient } from '@/lib/supabase/client'
import { resolveStorageUrl } from '@/lib/storage/media-url'
import type { OnboardingProfile, Plan } from '@/types/database'

type PlanCountdownProps = {
  profile: OnboardingProfile
  activePlan: Plan | null
  coachName?: string | null
  coachBio?: string | null
  coachPhotoPath?: string | null
  planSlug?: string | null
}

export function PlanCountdownCard({
  profile,
  activePlan,
  coachName,
  coachBio,
  coachPhotoPath,
  planSlug,
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
  const displayCoach = coachName?.trim() || 'Your coach'
  const deliveryHours = isDigital ? DIGITAL_PLAN_DELIVERY_HOURS : PLAN_DELIVERY_HOURS
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!coachPhotoPath || isDigital) {
        setPhotoUrl(null)
        return
      }
      const url = await resolveStorageUrl(createClient(), 'avatars', coachPhotoPath)
      if (!cancelled) setPhotoUrl(url)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [coachPhotoPath, isDigital])

  // Once diet + workout have been opened, leave the upper slot for the tracker.
  if (planReady && openedCore) return null

  // Payment done, but onboarding not finished yet
  if (!profile.onboarding_complete && (profile.coach_id || isDigital)) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        {!isDigital ? (
          <CoachAssignedHeader coachName={displayCoach} photoUrl={photoUrl} bio={coachBio} />
        ) : (
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
            Finish setup for your customised plan
          </p>
        )}
        <p style={{ margin: '12px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.55 }}>
          {isDigital
            ? `Complete onboarding so we can build your AI customised plan. Delivery is within ${deliveryHours} hours after you submit — by email and in the app.`
            : `Complete onboarding so ${displayCoach.split(' ')[0]} can build your personal diet and workout. Your plan is delivered within ${deliveryHours} hours after onboarding.`}
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
                ? 'Your AI customised plan is ready. Open it in the app — we also emailed you a link.'
                : `${displayCoach} sent your diet and workout. Open both sections to unlock your daily tracker focus.`}
            </p>
            <Button fullWidth style={{ marginTop: 12 }} onClick={() => router.push('/plan')}>
              {isDigital ? 'Open your plan' : 'Open diet & workout'}
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
          Assigning your coach
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          You&apos;ll see your coach&apos;s name here shortly. Plan delivery starts after onboarding.
        </p>
      </Card>
    )
  }

  if (!profile.onboarding_completed_at) return null

  if (isDigital) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
          Building your customised plan
        </p>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.55 }}>
          Your AI personalized plan is being prepared. You&apos;ll get an email when it&apos;s ready,
          and it will also appear in My Plan.
        </p>
        <p style={{ margin: '14px 0 4px', fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>
          Estimated delivery
        </p>
        <p style={{ margin: 0, fontSize: 14, color: colors.textSecondary }}>
          Within {deliveryHours} hours
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
      <CoachAssignedHeader coachName={displayCoach} photoUrl={photoUrl} bio={coachBio} />
      {coachBio?.trim() ? (
        <p style={{ margin: '10px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>{coachBio.trim()}</p>
      ) : null}
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
        <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.textMuted }}>Your coach</p>
      </div>
    </div>
  )
}
