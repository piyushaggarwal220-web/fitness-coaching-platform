'use client'

import { useEffect, useState } from 'react'
import { ClientShell } from '@/components/ui/ClientShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  isAndroidDevice,
  isIosDevice,
  isStandaloneDisplay,
  manualInstallCopy,
  triggerNativeInstall,
} from '@/lib/pwa-install'
import { colors, spacing } from '@/lib/design-tokens'
import { Download, Share, Smartphone } from 'lucide-react'

export default function InstallAppPage() {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other')
  const [installed, setInstalled] = useState(false)
  const [installOutcome, setInstallOutcome] = useState<string | null>(null)

  useEffect(() => {
    if (isStandaloneDisplay()) setInstalled(true)
    if (isIosDevice()) setPlatform('ios')
    else if (isAndroidDevice()) setPlatform('android')
  }, [])

  const tryInstall = async () => {
    const outcome = await triggerNativeInstall()
    if (outcome === 'accepted') setInstalled(true)
    else if (outcome === 'unavailable') setInstallOutcome(manualInstallCopy())
    else setInstallOutcome('Install dismissed — use the steps below anytime.')
  }

  return (
    <ClientShell title="Install app">
      <Card variant="elevated" style={{ marginBottom: spacing[3] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Smartphone size={22} color={colors.accent} />
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Add Lurvox to your phone</p>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          Lurvox runs in your browser and installs like an app — no Play Store or App Store needed.
          You get faster access, full-screen coaching, and push reminders.
        </p>
        {installed ? (
          <p style={{ margin: 0, color: colors.success, fontWeight: 600 }}>You&apos;re already using the installed app.</p>
        ) : platform === 'android' ? (
          <>
            <Button fullWidth onClick={() => void tryInstall()} style={{ marginBottom: 12 }}>
              <Download size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Install on Android
            </Button>
            <ol style={stepList}>
              <li>Open <strong>app.lurvox.in</strong> in Chrome.</li>
              <li>Tap the menu <strong>⋮</strong> (top right).</li>
              <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
              <li>Confirm — Lurvox appears on your home screen like any other app.</li>
            </ol>
          </>
        ) : platform === 'ios' ? (
          <ol style={stepList}>
            <li>Open <strong>app.lurvox.in</strong> in Safari (not Chrome).</li>
            <li>
              Tap the <Share size={14} style={{ verticalAlign: 'text-bottom' }} /> <strong>Share</strong> button at the bottom.
            </li>
            <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> — open Lurvox from your home screen anytime.</li>
          </ol>
        ) : (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: colors.textSecondary }}>
              On your phone: {manualInstallCopy()}
            </p>
            <ol style={stepList}>
              <li>On Android — use Chrome and Install app from the menu.</li>
              <li>On iPhone — use Safari → Share → Add to Home Screen.</li>
              <li>On desktop Chrome — click the install icon in the address bar.</li>
            </ol>
          </>
        )}
        {installOutcome && (
          <p style={{ marginTop: 12, fontSize: 13, color: colors.textMuted }}>{installOutcome}</p>
        )}
      </Card>

      <Card variant="glass">
        <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Why install?</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: colors.textSecondary, lineHeight: 1.6 }}>
          <li>One tap from your home screen</li>
          <li>Check-ins, tracker, and coach chat without browser tabs</li>
          <li>Push reminders for weekly check-ins and your coach call</li>
        </ul>
      </Card>
    </ClientShell>
  )
}

const stepList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 14,
  color: colors.textSecondary,
  lineHeight: 1.65,
}
