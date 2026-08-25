'use client'

import { Calendar, ChevronRight, Timer } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { getCheckinTypeDisplayName, describeCheckinWindow, type ScheduledCheckin } from '@/lib/checkin-schedule'
import { colors, layout, spacing } from '@/lib/design-tokens'

type Props = {
  checkin: ScheduledCheckin
  /** When due, banner is tappable. When countdown, it shows time until available. */
  mode?: 'due' | 'countdown'
  countdownLabel?: string | null
}

/** Keeps page content clear of the fixed banner (icon row + padding). */
export const CHECKIN_DUE_BANNER_HEIGHT = 72

/**
 * Fixed top-of-homescreen check-in status.
 * Portaled + fixed so page-enter transforms / overflow ancestors cannot unpin it.
 */
export function CheckinDueBanner({
  checkin,
  mode = 'due',
  countdownLabel = null,
}: Props) {
  const router = useRouter()
  const typeLabel = getCheckinTypeDisplayName(checkin.type)
  const [mounted, setMounted] = useState(false)
  const isDue = mode === 'due'

  useEffect(() => {
    setMounted(true)
  }, [])

  const sharedShell: CSSProperties = {
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
    borderBottom: isDue
      ? '1px solid rgba(249, 115, 22, 0.35)'
      : '1px solid rgba(255, 255, 255, 0.08)',
    background: isDue
      ? 'linear-gradient(90deg, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0.12) 55%, rgba(24,24,27,0.96) 100%)'
      : 'linear-gradient(90deg, rgba(39,39,42,0.98) 0%, rgba(24,24,27,0.96) 100%)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    color: colors.textPrimary,
    textAlign: 'left',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  }

  const icon = isDue ? (
    <Calendar size={20} color={colors.accent} aria-hidden />
  ) : (
    <Timer size={20} color={colors.accent} aria-hidden />
  )

  const body = (
    <>
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
        {icon}
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
          {isDue ? 'Check-in due' : 'Next check-in'}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
          {typeLabel} · Week {checkin.coachingWeek}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textSecondary }}>
          {isDue
            ? `Available now (${describeCheckinWindow(checkin.type)}) · tap to start`
            : countdownLabel?.trim()
              ? `Available in ${countdownLabel.trim()}`
              : 'Next check-in coming up'}
        </p>
      </div>
      {isDue ? (
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
      ) : null}
    </>
  )

  const banner = isDue ? (
    <button
      type="button"
      onClick={() => router.push(checkin.href)}
      aria-label={`${typeLabel} check-in is due. Start now.`}
      style={{ ...sharedShell, cursor: 'pointer' }}
    >
      {body}
    </button>
  ) : (
    <div
      role="status"
      aria-label={`${typeLabel} check-in available in ${countdownLabel?.trim() || 'some time'}`}
      style={{ ...sharedShell, cursor: 'default' }}
    >
      {body}
    </div>
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
