'use client'

import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { MembershipRenewalPrompt } from '@/lib/subscription'
import { colors, spacing } from '@/lib/design-tokens'

type Props = {
  prompt: MembershipRenewalPrompt
}

/** In-flow renew alert when membership is ≤7 days from ending or in the grace window. */
export function MembershipRenewalBanner({ prompt }: Props) {
  const router = useRouter()
  const isDanger = prompt.tone === 'danger'

  return (
    <button
      type="button"
      onClick={() => router.push(prompt.href)}
      aria-label={`${prompt.title}. ${prompt.ctaLabel}.`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing[3],
        width: '100%',
        marginBottom: spacing[4],
        padding: `${spacing[3]}px ${spacing[4]}px`,
        border: `1px solid ${isDanger ? 'rgba(239, 68, 68, 0.4)' : 'rgba(249, 115, 22, 0.4)'}`,
        borderRadius: 14,
        background: isDanger
          ? 'linear-gradient(90deg, rgba(239,68,68,0.18) 0%, rgba(24,24,27,0.96) 100%)'
          : 'linear-gradient(90deg, rgba(249,115,22,0.2) 0%, rgba(24,24,27,0.96) 100%)',
        color: colors.textPrimary,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: isDanger ? colors.dangerMuted : colors.accentMuted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <AlertTriangle size={20} color={isDanger ? colors.danger : colors.accent} aria-hidden />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isDanger ? colors.danger : colors.accent,
          }}
        >
          {prompt.title}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600, color: colors.textPrimary, lineHeight: 1.35 }}>
          {prompt.body}
        </p>
      </div>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
          fontSize: 13,
          fontWeight: 700,
          color: isDanger ? colors.danger : colors.accent,
        }}
      >
        {prompt.ctaLabel}
        <ChevronRight size={16} aria-hidden />
      </span>
    </button>
  )
}
