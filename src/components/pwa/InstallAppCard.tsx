'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { colors, spacing } from '@/lib/design-tokens'
import {
  getDeferredInstall,
  isIosDevice,
  isStandaloneDisplay,
  manualInstallCopy,
  triggerNativeInstall,
} from '@/lib/pwa-install'

/** Always-available install guidance on Profile (not a blocking popup). */
export function InstallAppCard() {
  const [standalone, setStandalone] = useState(false)
  const [canNative, setCanNative] = useState(false)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setStandalone(isStandaloneDisplay())
    setCanNative(Boolean(getDeferredInstall()))
    setHint(manualInstallCopy())
    const onAvailable = () => setCanNative(true)
    window.addEventListener('lurvox-install-available', onAvailable)
    return () => window.removeEventListener('lurvox-install-available', onAvailable)
  }, [])

  if (standalone) {
    return (
      <Card variant="glass" style={{ marginBottom: spacing[4] }}>
        <p style={{ margin: 0, fontWeight: 700, color: colors.textPrimary }}>Lurvox app installed</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.textSecondary }}>
          You&apos;re using the home-screen app.
        </p>
      </Card>
    )
  }

  const onInstall = async () => {
    setBusy(true)
    const outcome = await triggerNativeInstall()
    setBusy(false)
    if (outcome === 'unavailable') {
      setHint(manualInstallCopy())
      setCanNative(false)
    }
  }

  return (
    <Card variant="elevated" style={{ marginBottom: spacing[4] }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: colors.accentMuted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Download size={20} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
            {isIosDevice() ? 'Add to Home Screen' : 'Install Lurvox app'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.textSecondary, lineHeight: 1.45 }}>
            {hint}
          </p>
          {canNative && (
            <button
              type="button"
              onClick={() => void onInstall()}
              disabled={busy}
              style={{
                marginTop: 12,
                minHeight: 40,
                padding: '8px 14px',
                borderRadius: 12,
                border: 'none',
                backgroundColor: colors.accent,
                color: colors.textInverse,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {busy ? 'Opening…' : 'Install now'}
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
