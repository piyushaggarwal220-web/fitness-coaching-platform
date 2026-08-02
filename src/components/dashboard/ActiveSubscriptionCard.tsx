'use client'

import { CalendarDays, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import {
  checkoutHrefForSubscription,
  subscriptionPlanActionLabel,
  type ActiveSubscription,
} from '@/lib/subscription'
import { colors, spacing } from '@/lib/design-tokens'

type Props = {
  subscription: ActiveSubscription
}

export function ActiveSubscriptionCard({ subscription }: Props) {
  const router = useRouter()
  const isActive = subscription.status === 'active'
  const actionLabel = subscriptionPlanActionLabel(subscription)
  const href = checkoutHrefForSubscription(subscription)

  return (
    <Card
      variant="glass"
      interactive
      onClick={() => router.push(href)}
      style={{ marginBottom: spacing[4] }}
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
          {isActive && subscription.daysRemaining != null && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: colors.textSecondary }}>
              {subscription.daysRemaining === 0
                ? 'Ends today'
                : `${subscription.daysRemaining} day${subscription.daysRemaining === 1 ? '' : 's'} remaining`}
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
            {actionLabel}
            <ChevronRight size={16} aria-hidden />
          </p>
        </div>
      </div>
    </Card>
  )
}
