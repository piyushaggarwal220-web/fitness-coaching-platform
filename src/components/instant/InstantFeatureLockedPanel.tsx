'use client'

import Link from 'next/link'
import { Check, ListChecks, Lock, Map, MessageCircle, Sparkles } from 'lucide-react'
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
import {
  instantBundleSavingsPaise,
  instantUnlockPitchForFeature,
} from '@/lib/instant-unlock-pitch'

type Props = {
  feature: InstantFeature
  title?: string
  description?: string
}

const FEATURE_ICON = {
  tracker: ListChecks,
  journey: Map,
  ai_chat: MessageCircle,
} as const

export function InstantFeatureLockedPanel({ feature, title, description }: Props) {
  const label = INSTANT_FEATURE_LABEL[feature]
  const pitch = instantUnlockPitchForFeature(feature)
  const single = formatInrFromPaise(PLATFORM_UNLOCK_SINGLE_PAISE)
  const bundle = formatInrFromPaise(PLATFORM_UNLOCK_BUNDLE_PAISE)
  const savings = formatInrFromPaise(instantBundleSavingsPaise())
  const Icon = FEATURE_ICON[feature]

  return (
    <div
      style={{
        margin: `${spacing[3]}px ${spacing[2]}px ${spacing[5]}px`,
        animation: 'cardEnter 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: radius.lg,
          border: `1px solid rgba(249, 115, 22, 0.22)`,
          background:
            'linear-gradient(165deg, rgba(249,115,22,0.16) 0%, rgba(24,24,27,0.98) 38%, rgba(9,9,11,1) 100%)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(249,115,22,0.28), transparent 60%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', padding: `${spacing[5]}px ${spacing[4]}px` }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: radius.full,
              background: 'rgba(249,115,22,0.14)',
              border: '1px solid rgba(249,115,22,0.28)',
              color: colors.accent,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <Lock size={12} strokeWidth={2.5} />
            {pitch.eyebrow}
          </div>

          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              marginTop: spacing[4],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: colors.accentMuted,
              border: `1px solid rgba(249,115,22,0.25)`,
            }}
          >
            <Icon size={26} color={colors.accent} strokeWidth={2.2} />
          </div>

          <h2
            style={{
              margin: `${spacing[3]}px 0 0`,
              fontSize: 'clamp(1.35rem, 5vw, 1.65rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              color: colors.textPrimary,
            }}
          >
            {title ?? pitch.headline}
          </h2>

          <p
            style={{
              margin: `${spacing[2]}px 0 0`,
              fontSize: 14,
              lineHeight: 1.55,
              color: colors.textSecondary,
            }}
          >
            {description ?? pitch.blurb}
          </p>

          <ul
            style={{
              listStyle: 'none',
              margin: `${spacing[4]}px 0 0`,
              padding: 0,
              display: 'grid',
              gap: 10,
            }}
          >
            {pitch.benefits.map((item) => (
              <li
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: colors.textPrimary,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    flexShrink: 0,
                    marginTop: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: colors.successMuted,
                    color: colors.success,
                  }}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div
            style={{
              marginTop: spacing[5],
              padding: spacing[3],
              borderRadius: radius.md,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${colors.borderSubtle}`,
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: colors.textPrimary,
                lineHeight: 1,
              }}
            >
              {single}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.textMuted, fontWeight: 600 }}>
              One-time · lifetime access · not monthly
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: spacing[4] }}>
            <Link href={unlockHrefForFeature(feature)} style={{ textDecoration: 'none' }}>
              <Button style={{ width: '100%' }}>
                Unlock {label} · {single}
              </Button>
            </Link>
            <Link href="/unlock?feature=bundle" style={{ textDecoration: 'none' }}>
              <Button
                variant="secondary"
                style={{
                  width: '100%',
                  borderColor: 'rgba(249,115,22,0.35)',
                  color: colors.textPrimary,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color={colors.accent} />
                  Unlock all three · {bundle}
                </span>
              </Button>
            </Link>
          </div>

          <p
            style={{
              margin: `${spacing[3]}px 0 0`,
              textAlign: 'center',
              fontSize: 12,
              lineHeight: 1.45,
              color: colors.textMuted,
            }}
          >
            Bundle saves {savings} vs buying separately. Pay once — yours for life.
          </p>
        </div>
      </div>
    </div>
  )
}
