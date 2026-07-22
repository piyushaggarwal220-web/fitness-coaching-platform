'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { colors, layout, radius, spacing } from '@/lib/design-tokens'
import {
  getDeferredInstall,
  isIosDevice,
  isStandaloneDisplay,
  manualInstallCopy,
  markInstallDismissedToday,
  triggerNativeInstall,
  wasInstallDismissedToday,
} from '@/lib/pwa-install'

type PromptMode = 'ios' | 'native' | 'manual'

/**
 * Install tip — mount only on home dashboards.
 * Marks “seen today” as soon as it opens so remounts stay quiet.
 */
export function PwaInstallPrompt() {
  const [mode, setMode] = useState<PromptMode | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandaloneDisplay()) return
    if (wasInstallDismissedToday()) return

    const open = (next: PromptMode) => {
      // Claim the once-per-day slot immediately so remounts stay quiet.
      markInstallDismissedToday()
      setMode(next)
      setVisible(true)
    }

    if (isIosDevice()) {
      open('ios')
      return
    }

    if (getDeferredInstall()) {
      open('native')
      return
    }

    const onAvailable = () => {
      if (wasInstallDismissedToday()) return
      open('native')
    }
    window.addEventListener('lurvox-install-available', onAvailable)

    const fallbackTimer = window.setTimeout(() => {
      if (wasInstallDismissedToday() || isStandaloneDisplay()) return
      if (getDeferredInstall()) open('native')
      else open('manual')
    }, 800)

    return () => {
      window.removeEventListener('lurvox-install-available', onAvailable)
      window.clearTimeout(fallbackTimer)
    }
  }, [])

  const dismiss = () => {
    markInstallDismissedToday()
    setVisible(false)
    setMode(null)
  }

  const install = async () => {
    const outcome = await triggerNativeInstall()
    if (outcome === 'unavailable') {
      setMode('manual')
      return
    }
    dismiss()
  }

  if (!visible || !mode) return null

  const title = mode === 'ios' ? 'Add Lurvox to Home Screen' : 'Install Lurvox app'
  const detail =
    mode === 'ios' ? (
      <span style={styles.detail}>
        Tap <Share size={12} style={styles.inlineIcon} aria-hidden /> Share, then{' '}
        <strong style={styles.emphasis}>Add to Home Screen</strong>.
      </span>
    ) : mode === 'manual' ? (
      <span style={styles.detail}>{manualInstallCopy()}</span>
    ) : (
      <span style={styles.detail}>Add to your home screen for faster access.</span>
    )

  return (
    <div role="dialog" aria-label="Install Lurvox app" style={styles.banner}>
      <div style={styles.copy}>
        <strong style={styles.title}>{title}</strong>
        {detail}
      </div>
      <div style={styles.actions}>
        {mode === 'native' && (
          <button type="button" onClick={() => void install()} style={styles.installBtn}>
            <Download size={16} />
            Install
          </button>
        )}
        {(mode === 'ios' || mode === 'manual') && (
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
    bottom: `calc(${layout.bottomNavHeight}px + ${spacing[3]}px + env(safe-area-inset-bottom, 0px))`,
    zIndex: 1100,
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
