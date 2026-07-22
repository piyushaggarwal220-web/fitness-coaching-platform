'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { colors, radius, spacing } from '@/lib/design-tokens'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PromptMode = 'android' | 'ios'

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

function isStandaloneDisplay(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari home-screen apps set this legacy flag.
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isIosDevice(): boolean {
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ may report as Mac with touch.
  const iPadOs = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  return iOS || iPadOs
}

/** Optional install banner — never blocks the app. Supports Android install + iOS tip. */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [mode, setMode] = useState<PromptMode | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (wasDismissedRecently()) return
    if (isStandaloneDisplay()) return

    if (isIosDevice()) {
      setMode('ios')
      setVisible(true)
      return
    }

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
      setMode('android')
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
    setMode(null)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setVisible(false)
    setDeferred(null)
    setMode(null)
  }

  if (!visible || !mode) return null
  if (mode === 'android' && !deferred) return null

  return (
    <div role="dialog" aria-label="Install Lurvox app" style={styles.banner}>
      <div style={styles.copy}>
        <strong style={styles.title}>
          {mode === 'ios' ? 'Add Lurvox to Home Screen' : 'Install Lurvox'}
        </strong>
        {mode === 'ios' ? (
          <span style={styles.detail}>
            Tap <Share size={12} style={styles.inlineIcon} aria-hidden /> Share, then{' '}
            <strong style={styles.emphasis}>Add to Home Screen</strong> for the app experience.
          </span>
        ) : (
          <span style={styles.detail}>Add to your home screen for faster access.</span>
        )}
      </div>
      <div style={styles.actions}>
        {mode === 'android' && (
          <button type="button" onClick={() => void install()} style={styles.installBtn}>
            <Download size={16} />
            Install
          </button>
        )}
        {mode === 'ios' && (
          <button type="button" onClick={dismiss} style={styles.installBtn}>
            Got it
          </button>
        )}
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
    gap: 4,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  detail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 1.45,
  },
  emphasis: {
    color: colors.textPrimary,
    fontWeight: 700,
  },
  inlineIcon: {
    display: 'inline',
    verticalAlign: 'text-bottom',
    margin: '0 2px',
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
    whiteSpace: 'nowrap',
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
