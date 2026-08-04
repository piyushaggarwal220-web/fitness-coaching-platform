'use client'

import { Calendar, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { getCheckinTypeDisplayName } from '@/lib/checkin-schedule'
import type { ScheduledCheckin } from '@/lib/checkin-schedule'
import { colors, layout, spacing } from '@/lib/design-tokens'

type Props = {
  checkin: ScheduledCheckin
}

/** Keeps page content clear of the fixed banner (icon row + padding). */
export const CHECKIN_DUE_BANNER_HEIGHT = 72

/**
 * Fixed top-of-homescreen alert while a check-in window is open.
 * Portaled + fixed so page-enter transforms / overflow ancestors cannot unpin it.
 */
export function CheckinDueBanner({ checkin }: Props) {
  const router = useRouter()
  const typeLabel = getCheckinTypeDisplayName(checkin.type)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const banner = (
    <button
      type="button"
      onClick={() => router.push(checkin.href)}
      aria-label={`${typeLabel} check-in is due. Start now.`}
      style={{
        position: 'fixed',
        top: `calc(${layout.topBarHeight}px + env(safe-area-inset-top, 0px))`,
        left: 0,
        right: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: spacing[3],
        width: '100%',
        maxWidth: layout.maxWidthWide,
        marginLeft: 'auto',
        marginRight: 'auto',
        minHeight: CHECKIN_DUE_BANNER_HEIGHT,
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
          Check-in due
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
          {typeLabel} · Week {checkin.coachingWeek}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textSecondary }}>
          Available now · tap to start
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

  return (
    <>
      <div
        aria-hidden
        style={{
          height: CHECKIN_DUE_BANNER_HEIGHT,
          marginTop: -spacing[3],
          marginBottom: spacing[4],
        }}
      />
      {mounted ? createPortal(banner, document.body) : null}
    </>
  )
}
