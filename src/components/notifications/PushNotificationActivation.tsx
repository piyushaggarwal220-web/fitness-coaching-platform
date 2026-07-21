'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellOff, BellRing, CheckCircle2, Settings } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  enableWebPush,
  getWebPushStatus,
  WEB_PUSH_STATUS_CHANGED_EVENT,
  type WebPushStatus,
} from '@/lib/notifications/web-push-client'
import { createClient } from '@/lib/supabase/client'

function useWebPushStatus() {
  const [status, setStatus] = useState<WebPushStatus>('checking')

  const refresh = useCallback(async () => {
    setStatus(await getWebPushStatus())
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener(WEB_PUSH_STATUS_CHANGED_EVENT, refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener(WEB_PUSH_STATUS_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refresh])

  return { status, refresh }
}

function getStatusContent(status: WebPushStatus) {
  switch (status) {
    case 'enabled':
      return {
        label: 'Enabled',
        detail: 'This browser is subscribed to coaching reminders.',
        color: colors.success,
        background: colors.successMuted,
        icon: <CheckCircle2 size={22} color={colors.success} />,
      }
    case 'blocked':
      return {
        label: 'Blocked',
        detail: 'Allow notifications in this site’s browser or device settings, then come back and try again.',
        color: colors.danger,
        background: colors.dangerMuted,
        icon: <BellOff size={22} color={colors.danger} />,
      }
    case 'unsupported':
      return {
        label: 'Unavailable',
        detail: 'This browser cannot use web push. On iPhone or iPad, add the site to your Home Screen and open it there.',
        color: colors.warning,
        background: colors.warningMuted,
        icon: <BellOff size={22} color={colors.warning} />,
      }
    default:
      return {
        label: status === 'checking' ? 'Checking…' : 'Not enabled',
        detail: 'Turn on notifications so you do not miss coach messages, plan updates, and check-in reminders.',
        color: colors.warning,
        background: colors.warningMuted,
        icon: <BellRing size={22} color={colors.warning} />,
      }
  }
}

export function PushNotificationCard() {
  const { status, refresh } = useWebPushStatus()
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState('')
  const content = getStatusContent(status)

  const enable = async () => {
    setEnabling(true)
    setError('')
    const result = await enableWebPush()
    if (!result.ok) setError(result.error)
    await refresh()
    setEnabling(false)
  }

  return (
    <Card variant="glass" style={{ borderColor: content.color, marginBottom: spacing[4] }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
        <div style={{ ...styles.icon, backgroundColor: content.background }}>{content.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] }}>
            <p style={styles.title}>Push notifications</p>
            <span style={{ ...styles.badge, color: content.color, backgroundColor: content.background }}>
              {content.label}
            </span>
          </div>
          <p style={styles.detail}>{content.detail}</p>
        </div>
      </div>

      {error && <p role="alert" style={styles.error}>{error}</p>}

      {status !== 'enabled' && status !== 'checking' && (
        <Button
          fullWidth
          variant={status === 'blocked' || status === 'unsupported' ? 'secondary' : 'primary'}
          loading={enabling}
          onClick={() => void enable()}
          style={{ marginTop: spacing[3] }}
        >
          {status === 'blocked' ? <><Settings size={18} /> Check again</> : 'Enable notifications'}
        </Button>
      )}
    </Card>
  )
}

export function NotificationActivationGate() {
  const { status, refresh } = useWebPushStatus()
  const [userId, setUserId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState('')
  const content = getStatusContent(status)

  useEffect(() => {
    let active = true
    void createClient().auth.getUser().then(({ data }) => {
      if (!active || !data.user) return
      const id = data.user.id
      setUserId(id)
      setDismissed(sessionStorage.getItem(`notification-gate-dismissed:${id}`) === '1')
    })
    return () => { active = false }
  }, [])

  const enable = async () => {
    setAttempted(true)
    setEnabling(true)
    setError('')
    const result = await enableWebPush()
    if (!result.ok) setError(result.error)
    await refresh()
    setEnabling(false)
  }

  const continueWithFallback = () => {
    if (!userId) return
    sessionStorage.setItem(`notification-gate-dismissed:${userId}`, '1')
    setDismissed(true)
  }

  if (!userId || dismissed || status === 'checking' || status === 'enabled') return null

  const canContinue = status === 'blocked' || status === 'unsupported' || attempted

  return (
    <div style={styles.backdrop}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-gate-title"
        style={styles.dialog}
      >
        <div style={{ ...styles.largeIcon, backgroundColor: content.background }}>{content.icon}</div>
        <p style={styles.eyebrow}>Stay connected</p>
        <h1 id="notification-gate-title" style={styles.heading}>Turn on notifications</h1>
        <p style={styles.intro}>
          Get important coach messages, plan updates, and check-in reminders even when the app is not open.
        </p>

        {(status === 'blocked' || status === 'unsupported') && (
          <div style={{ ...styles.notice, backgroundColor: content.background, color: content.color }}>
            {content.detail}
          </div>
        )}
        {error && <div role="alert" style={styles.error}>{error}</div>}

        <Button fullWidth loading={enabling} onClick={() => void enable()}>
          <BellRing size={19} />
          {status === 'blocked' ? 'Check permission again' : 'Enable notifications'}
        </Button>

        {canContinue && (
          <Button fullWidth variant="ghost" onClick={continueWithFallback}>
            Continue with in-app notifications
          </Button>
        )}

        <p style={styles.footnote}>
          Your browser requires you to approve this. The app cannot turn notifications on without your permission.
        </p>
      </section>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
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
  icon: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  footnote: {
    margin: '12px 0 0',
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  title: { margin: 0, color: colors.textPrimary, fontWeight: 700, fontSize: 16 },
  detail: { margin: '7px 0 0', color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 },
  badge: {
    padding: '5px 9px',
    borderRadius: radius.full,
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
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
