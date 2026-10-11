'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { clientColors as colors, spacing } from '@/lib/design-tokens'

type Props = {
  lastDeliveredLabel: string
  timingLabel: string
  showChat: boolean
}

export function PlanUpdateHome({ lastDeliveredLabel, timingLabel, showChat }: Props) {
  const router = useRouter()

  return (
    <section style={{ marginBottom: spacing[6] }}>
      <Card variant="elevated">
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted }}>
          Your plan
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700, color: colors.textPrimary, lineHeight: 1.4 }}>
          {lastDeliveredLabel}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.5 }}>
          {timingLabel}
        </p>
        {showChat && (
          <div style={{ marginTop: spacing[4], display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 15, color: colors.textPrimary }}>Got any doubts?</p>
            <button
              type="button"
              onClick={() => router.push('/client/chat')}
              style={{
                minHeight: 36,
                padding: '6px 14px',
                borderRadius: 999,
                border: 'none',
                background: colors.accent,
                color: colors.textInverse,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Talk to Smart Coach
            </button>
          </div>
        )}
      </Card>
    </section>
  )
}
