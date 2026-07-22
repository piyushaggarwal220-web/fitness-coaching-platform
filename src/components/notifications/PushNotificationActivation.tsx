'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BellOff, BellRing, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  enableWebPush,
  getWebPushStatus,
  WEB_PUSH_STATUS_CHANGED_EVENT,
  type WebPushStatus,
} from '@/lib/notifications/web-push-client'
import { createClient } from '@/lib/supabase/client'

type NotificationAudience = 'client' | 'coach'

const DISMISS_STORAGE_KEY = 'notification-prompt-dismissed-at'
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000

function wasDismissedToday(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY)
    if (!raw) return false
    const dismissedAt = Number(raw)
    if (!Number.isFinite(dismissedAt)) return false
    return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS
  } catch {
    return false
  }
}

function markDismissedToday() {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()))
    window.localStorage.removeItem('notification-nudge-dismissed-at')
  } catch {
    // Ignore storage failures
  }
}

function useWebPushStatus() {
  const [status, setStatus] = useState<WebPushStatus>('checking')

  const refresh = useCallback(async () => {
    setStatus(await getWebPushStatus())
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener(WEB_PUSH_STATUS_CHANGED_EVENT, refresh)
    return () => {
      window.removeEventListener(WEB_PUSH_STATUS_CHANGED_EVENT, refresh)
    }
  }, [refresh])

  return { status, refresh }
}

function getStatusContent(status: WebPushStatus, audience: NotificationAudience) {
  switch (status) {
    case 'enabled':
      return {
        detail: 'This browser is subscribed to coaching reminders.',
        color: colors.success,
        background: colors.successMuted,
        icon: <CheckCircle2 size={22} color={colors.success} />,
      }
    case 'blocked':
      return {
        detail: 'Allow notifications in this site’s browser or device settings, then come back and try again. You can keep using the app without them.',
        color: colors.danger,
        background: colors.dangerMuted,
        icon: <BellOff size={22} color={colors.danger} />,
      }
    case 'unsupported':
      return {
        detail: 'This browser cannot use web push. You can keep using the app with in-app alerts. On iPhone or iPad, add the site to your Home Screen for the best chance of push support.',
        color: colors.warning,
        background: colors.warningMuted,
        icon: <BellOff size={22} color={colors.warning} />,
      }
    default:
      return {
        detail: audience === 'coach'
          ? 'Turn on notifications so you do not miss client messages, submitted check-ins, and plan alerts.'
          : 'Turn on notifications so you do not miss coach messages, plan updates, and check-in reminders.',
        color: colors.warning,
        background: colors.warningMuted,
        icon: <BellRing size={22} color={colors.warning} />,
      }
  }
}

/**
 * Optional push prompt for home dashboards only.
 * - Never shows a “Checking…” screen
 * - Marks once-per-day as soon as it opens, so other sections never re-trigger it
 */
export function NotificationActivationGate({
  audience = 'client',
}: {
  audience?: NotificationAudience
}) {
  const { status, refresh } = useWebPushStatus()
  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState('')
  const content = getStatusContent(status, audience)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let active = true
    void createClient().auth.getUser().then(({ data }) => {
      if (!active) return
      if (data.user) setUserId(data.user.id)
      setAuthChecked(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!authChecked || !userId) return
    if (status === 'checking' || status === 'enabled') return
    if (wasDismissedToday()) {
      setOpen(false)
      return
    }
    // Claim today's slot immediately — prevents re-shows on remount / other pages.
    markDismissedToday()
    setOpen(true)
  }, [authChecked, userId, status])

  const enable = async () => {
    setEnabling(true)
    setError('')
    const result = await enableWebPush()
    if (!result.ok) setError(result.error)
    else setOpen(false)
    await refresh()
    setEnabling(false)
  }

  const dismiss = () => {
    markDismissedToday()
    setOpen(false)
  }

  if (!mounted || !open) return null

  const canEnable = status !== 'unsupported'

  return createPortal(
    <div style={styles.backdrop}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-gate-title"
        style={styles.dialog}
      >
        <div style={{ ...styles.largeIcon, backgroundColor: content.background }}>{content.icon}</div>
        <p style={styles.eyebrow}>Stay connected</p>
        <h1 id="notification-gate-title" style={styles.heading}>
          Turn on notifications
        </h1>
        <p style={styles.intro}>
          {audience === 'coach'
            ? 'Get client messages, submitted check-ins, and plan alerts even when the coaching dashboard is not open.'
            : 'Get important coach messages, plan updates, and check-in reminders even when the app is not open.'}
        </p>

        {(status === 'blocked' || status === 'unsupported') && (
          <div style={{ ...styles.notice, backgroundColor: content.background, color: content.color }}>
            {content.detail}
          </div>
        )}
        {error && <div role="alert" style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          {canEnable && (
            <Button fullWidth loading={enabling} onClick={() => void enable()}>
              <BellRing size={19} />
              {status === 'blocked' ? 'Check permission again' : 'Enable notifications'}
            </Button>
          )}
          <button type="button" onClick={dismiss} style={styles.skipBtn}>
            Not now — continue without notifications
          </button>
        </div>

        <p style={styles.footnote}>
          Notifications are optional. You can enable them later from the bell icon.
          We only ask once per day.
        </p>
      </section>
    </div>,
    document.body,
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: spacing[3],
    paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    backgroundColor: 'rgba(9, 9, 11, 0.96)',
    overflowY: 'auto',
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    padding: spacing[5],
    borderRadius: radius.lg,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgCard,
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.65)',
    textAlign: 'center',
  },
  largeIcon: {
    width: 64,
    height: 64,
    margin: '0 auto 16px',
    borderRadius: radius.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    margin: '0 0 6px',
    color: colors.accent,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  heading: {
    margin: 0,
    color: colors.textPrimary,
    fontSize: 'clamp(1.6rem, 7vw, 2rem)',
    lineHeight: 1.15,
  },
  intro: {
    margin: '12px 0 20px',
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 1.55,
  },
  notice: {
    marginBottom: spacing[3],
    padding: spacing[3],
    borderRadius: radius.sm,
    fontSize: 14,
    lineHeight: 1.5,
    textAlign: 'left',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  skipBtn: {
    width: '100%',
    minHeight: 48,
    padding: '12px 16px',
    borderRadius: radius.sm,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  footnote: {
    margin: '12px 0 0',
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  error: {
    margin: '12px 0 0',
    padding: '10px 12px',
    borderRadius: radius.sm,
    color: colors.danger,
    backgroundColor: colors.dangerMuted,
    fontSize: 13,
    lineHeight: 1.45,
    textAlign: 'left',
  },
}
