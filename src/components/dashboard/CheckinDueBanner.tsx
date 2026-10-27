'use client'

import { Calendar, ChevronRight, Timer } from 'lucide-react'
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { getCheckinTypeDisplayName, describeCheckinWindow, type ScheduledCheckin } from '@/lib/checkin-schedule'
import { clientColors as colors, layout } from '@/lib/design-tokens'
import { usePublicDemo } from '@/hooks/usePublicDemo'

type Props = {
  checkin: ScheduledCheckin
  /** When due, banner is tappable. When countdown, it shows time until available. */
  mode?: 'due' | 'countdown'
  countdownLabel?: string | null
}

/** Keeps page content clear of the fixed banner (one compact row). */
export const CHECKIN_DUE_BANNER_HEIGHT = 56

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
  const isDemo = usePublicDemo()
  const typeLabel = getCheckinTypeDisplayName(checkin.type)
  const [mounted, setMounted] = useState(false)
  const isDue = mode === 'due'

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!mounted || isDemo) {
      const root = document.documentElement
      root.classList.remove('has-checkin-due-banner')
      root.style.removeProperty('--lx-checkin-banner-h')
      root.style.removeProperty('--lx-checkin-banner-gap')
      return
    }
    const root = document.documentElement
    const applyHeight = (height: number) => {
      const next = Math.max(CHECKIN_DUE_BANNER_HEIGHT, Math.ceil(height))
      root.classList.add('has-checkin-due-banner')
      root.style.setProperty('--lx-checkin-banner-h', `${next}px`)
      root.style.setProperty('--lx-checkin-banner-gap', '8px')
    }
    applyHeight(CHECKIN_DUE_BANNER_HEIGHT)
    const node = document.getElementById('lx-checkin-due-banner')
    if (!node) {
      return () => {
        root.classList.remove('has-checkin-due-banner')
        root.style.removeProperty('--lx-checkin-banner-h')
        root.style.removeProperty('--lx-checkin-banner-gap')
      }
    }
    const sync = () => applyHeight(node.getBoundingClientRect().height)
    sync()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync)
    observer?.observe(node)
    return () => {
      observer?.disconnect()
      root.classList.remove('has-checkin-due-banner')
      root.style.removeProperty('--lx-checkin-banner-h')
      root.style.removeProperty('--lx-checkin-banner-gap')
    }
  }, [mounted, isDemo, isDue, countdownLabel, checkin.href, checkin.coachingWeek])

  const sharedShell: CSSProperties = {
    position: 'fixed',
    top: `calc(${layout.topBarHeight}px + env(safe-area-inset-top, 0px))`,
    left: 0,
    right: 0,
    zIndex: 90,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: layout.maxWidthWide,
    marginLeft: 'auto',
    marginRight: 'auto',
    minHeight: CHECKIN_DUE_BANNER_HEIGHT,
    padding: '6px 12px',
    border: 'none',
    borderBottom: isDue ? `2px solid ${colors.warning}` : `2px solid ${colors.accent}`,
    background: colors.bgSecondary,
    color: colors.textPrimary,
    textAlign: 'left',
    boxShadow: 'none',
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
          width: 32,
          height: 32,
          borderRadius: 10,
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
        <p
          style={{
            margin: '1px 0 0',
            fontSize: 13,
            fontWeight: 700,
            color: colors.textPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {typeLabel} · Week {checkin.coachingWeek}
          {isDue
            ? ` · ${describeCheckinWindow(checkin.type)}`
            : countdownLabel?.trim()
              ? ` · in ${countdownLabel.trim()}`
              : ''}
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
      id="lx-checkin-due-banner"
      type="button"
      onClick={() => router.push(checkin.href)}
      aria-label={`${typeLabel} check-in is due. Start now.`}
      style={{ ...sharedShell, cursor: 'pointer' }}
    >
      {body}
    </button>
  ) : (
    <div
      id="lx-checkin-due-banner"
      role="status"
      aria-label={`${typeLabel} check-in available in ${countdownLabel?.trim() || 'some time'}`}
      style={{ ...sharedShell, cursor: 'default' }}
    >
      {body}
    </div>
  )

  if (!mounted || isDemo) return null
  return createPortal(banner, document.body)
}
