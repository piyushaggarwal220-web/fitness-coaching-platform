'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { colors, radius, spacing } from '@/lib/design-tokens'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed-at'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

function wasDismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    return Number.isFinite(at) && Date.now() - at < DISMISS_MS
  } catch {
    return false
  }
}

/** Optional install banner — never blocks the app. */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (wasDismissedRecently()) return
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    setVisible(false)
    setDeferred(null)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setVisible(false)
    setDeferred(null)
  }

  if (!visible || !deferred) return null

  return (
    <div role="dialog" aria-label="Install Lurvox app" style={styles.banner}>
      <div style={styles.copy}>
        <strong style={styles.title}>Install Lurvox</strong>
        <span style={styles.detail}>Add to your home screen for faster access.</span>
      </div>
      <div style={styles.actions}>
        <button type="button" onClick={() => void install()} style={styles.installBtn}>
          <Download size={16} />
          Install
        </button>
        <button type="button" onClick={dismiss} style={styles.closeBtn} aria-label="Dismiss">
          <X size={18} />
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'fixed',
    left: spacing[3],
    right: spacing[3],
    bottom: `calc(${spacing[3]}px + env(safe-area-inset-bottom, 0px))`,
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgCard,
    boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
    maxWidth: 480,
    margin: '0 auto',
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  detail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 1.4,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  installBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    padding: '8px 14px',
    borderRadius: radius.sm,
    border: 'none',
    backgroundColor: colors.accent,
    color: colors.textInverse,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  closeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    color: colors.textSecondary,
    cursor: 'pointer',
  },
}
