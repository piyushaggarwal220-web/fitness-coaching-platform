'use client'

import { CalendarDays, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import {
  checkoutHrefForSubscription,
  isSubscriptionRenewalUrgent,
  subscriptionPlanActionLabel,
  type ActiveSubscription,
} from '@/lib/subscription'
import {
  canOfferEarlyPlanUpgrade,
  isLatePlanUpgrade,
  PLAN_LATE_UPGRADE_COPY,
  PLAN_UPGRADE_WINDOW_COPY,
} from '@/lib/payments/plan-upgrade-window'
import { colors, spacing } from '@/lib/design-tokens'

type Props = {
  subscription: ActiveSubscription
}

export function ActiveSubscriptionCard({ subscription }: Props) {
  const router = useRouter()
  const isActive = subscription.status === 'active'
  const renewSoon = isSubscriptionRenewalUrgent(subscription)
  const earlyUpgrade = canOfferEarlyPlanUpgrade(subscription)
  const lateUpgrade = isLatePlanUpgrade(subscription)
  const actionLabel = subscriptionPlanActionLabel(subscription)
  const href = checkoutHrefForSubscription(subscription)

  return (
    <Card
      variant="glass"
      interactive
      onClick={() => router.push(href)}
      style={{
        marginBottom: spacing[4],
        border: renewSoon
          ? `1px solid ${isActive ? 'rgba(249, 115, 22, 0.45)' : 'rgba(239, 68, 68, 0.45)'}`
          : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: isActive ? colors.accentMuted : colors.dangerMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CalendarDays size={22} color={isActive ? colors.accent : colors.danger} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: colors.textPrimary }}>
              {subscription.planName} coaching
            </p>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: isActive ? colors.success : colors.danger,
                backgroundColor: isActive ? colors.successMuted : colors.dangerMuted,
                padding: '4px 8px',
                borderRadius: 999,
              }}
            >
              {isActive ? 'Active' : 'Expired'}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: spacing[3],
              marginTop: spacing[3],
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>
                Starts
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
                {subscription.startsLabel}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>
                Ends
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
                {subscription.endsLabel}
              </p>
            </div>
          </div>
          {earlyUpgrade && (
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 13,
                fontWeight: 600,
                color: colors.accent,
                lineHeight: 1.4,
              }}
            >
              {PLAN_UPGRADE_WINDOW_COPY}
            </p>
          )}
          {lateUpgrade && (
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 13,
                fontWeight: 600,
                color: colors.textSecondary,
                lineHeight: 1.4,
              }}
            >
              {PLAN_LATE_UPGRADE_COPY}
            </p>
          )}
          {isActive && subscription.daysRemaining != null && (
            <p
              style={{
                margin: earlyUpgrade || lateUpgrade ? '8px 0 0' : '12px 0 0',
                fontSize: 13,
                fontWeight: renewSoon ? 700 : 500,
                color: renewSoon ? colors.accent : colors.textSecondary,
              }}
            >
              {subscription.daysRemaining === 0
                ? 'Ends today — renew to keep coaching'
                : `${subscription.daysRemaining} day${subscription.daysRemaining === 1 ? '' : 's'} remaining${
                    renewSoon ? ' — renew soon' : ''
                  }`}
            </p>
          )}
          {!isActive && (
            <p style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 700, color: colors.danger }}>
              Membership ended — renew to restore access
            </p>
          )}
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 13,
              fontWeight: 600,
              color: colors.accent,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {renewSoon && isActive && !earlyUpgrade ? 'Tap to renew / upgrade' : actionLabel}
            <ChevronRight size={16} aria-hidden />
          </p>
        </div>
      </div>
    </Card>
  )
}
