'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  INSTANT_FEATURE_LABEL,
  unlockHrefForFeature,
  type InstantFeature,
} from '@/lib/instant-feature-access'
import {
  PLATFORM_UNLOCK_BUNDLE_PAISE,
  PLATFORM_UNLOCK_SINGLE_PAISE,
} from '@/lib/payments/platform-unlock-catalog'
import { formatInrFromPaise } from '@/lib/payments/checkout-discounts'

type Props = {
  feature: InstantFeature
  title?: string
  description?: string
}

export function InstantFeatureLockedPanel({ feature, title, description }: Props) {
  const label = INSTANT_FEATURE_LABEL[feature]
  const single = formatInrFromPaise(PLATFORM_UNLOCK_SINGLE_PAISE)
  const bundle = formatInrFromPaise(PLATFORM_UNLOCK_BUNDLE_PAISE)

  return (
    <div
      style={{
        margin: spacing[4],
        padding: spacing[5],
        borderRadius: radius.md,
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.bgCard,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          margin: '0 auto 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.accentMuted,
        }}
      >
        <Lock size={22} color={colors.accent} />
      </div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.textPrimary }}>
        {title ?? `${label} is locked`}
      </h2>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: 14,
          lineHeight: 1.5,
          color: colors.textSecondary,
        }}
      >
        {description ??
          `Your Instant plan includes your customised plan. Unlock ${label.toLowerCase()} for ${single} one-time (lifetime), or get Tracker + Journey + AI chat for ${bundle} lifetime — not a monthly fee.`}
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: spacing[4],
        }}
      >
        <Link href={unlockHrefForFeature(feature)} style={{ textDecoration: 'none' }}>
          <Button style={{ width: '100%' }}>Unlock {label} · {single}</Button>
        </Link>
        <Link href="/unlock?feature=bundle" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" style={{ width: '100%' }}>
            Unlock all three · {bundle}
          </Button>
        </Link>
      </div>
    </div>
  )
}
