'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { requireAdmin } from '@/lib/admin-session'
import { adminStyles as s } from '@/lib/admin/styles'
import type { SystemSettings } from '@/lib/admin/platform-health'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export default function AdminSettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setError('')
      const admin = await requireAdmin(supabase, router)
      if (!admin) return

      try {
        const res = await fetch('/api/admin/settings')
        if (!res.ok) throw new Error('Failed to load settings')
        setSettings((await res.json()) as SystemSettings)
      } catch {
        setError('Failed to load system settings.')
      }

      setLoading(false)
    }

    void load()
  }, [router])

  if (loading) {
    return (
      <>
        <AdminNavbar />
        <div style={s.loading}>Loading settings…</div>
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <div style={s.page}>
        <div style={s.container}>
          <h1 style={s.title}>Settings</h1>
          <p style={s.subtitle}>Read-only system configuration (MVP)</p>

          {error && <div style={s.error}>{error}</div>}

          {settings && (
            <>
              <div style={s.card}>
                <h2 style={s.cardTitle}>Environment</h2>
                <div style={s.infoGrid}>
                  <Row label="Environment" value={settings.environment} />
                  <Row label="AI Provider" value={settings.aiProvider} />
                  <Row label="Current Model" value={settings.currentModel} />
                </div>
              </div>

              <div style={s.card}>
                <h2 style={s.cardTitle}>Feature flags</h2>
                <div style={s.infoGrid}>
                  {Object.entries(settings.featureFlags).map(([key, enabled]) => (
                    <Row
                      key={key}
                      label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                      value={enabled ? 'Enabled' : 'Disabled'}
                    />
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 13, color: '#888' }}>
                Configuration editing is not available in this MVP release.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}
