'use client'

import { Calendar, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { clientCheckinShortHint, clientCheckinTypeLabel } from '@/lib/client-ux-copy'
import type { ScheduledCheckin } from '@/lib/checkin-schedule'
import { colors, layout, spacing } from '@/lib/design-tokens'

type Props = {
  checkin: ScheduledCheckin
}

/** Sticky top-of-homescreen alert while a check-in window is open. */
export function CheckinDueBanner({ checkin }: Props) {
  const router = useRouter()
  const typeLabel = clientCheckinTypeLabel(checkin.type)

  return (
    <button
      type="button"
      onClick={() => router.push(checkin.href)}
      aria-label={`${typeLabel} is due. Start now.`}
      className="btn-press"
      style={{
        position: 'sticky',
        top: `calc(${layout.topBarHeight}px + env(safe-area-inset-top, 0px))`,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: spacing[3],
        width: `calc(100% + ${spacing[3] * 2}px)`,
        marginLeft: -spacing[3],
        marginRight: -spacing[3],
        marginTop: -spacing[3],
        marginBottom: spacing[4],
        padding: `${spacing[3]}px ${spacing[4]}px`,
        border: 'none',
        borderBottom: '1px solid rgba(249, 115, 22, 0.35)',
        background:
          'linear-gradient(90deg, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0.12) 55%, rgba(24,24,27,0.96) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: colors.textPrimary,
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.accentMuted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Calendar size={20} color={colors.accent} aria-hidden />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.accent,
          }}
        >
          Due now
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
          {typeLabel}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textSecondary }}>
          {clientCheckinShortHint(checkin.type)}
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
          color: colors.accent,
        }}
      >
        Start
        <ChevronRight size={16} aria-hidden />
      </span>
    </button>
  )
}
