'use client'

import type { IntegrationCard, JarvisDashboard } from './types'
import { j2, glassPanel, statusDot } from './styles'

type Row = { name: string; label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }

function integrationTone(status?: string): Row['tone'] {
  if (status === 'connected') return 'ok'
  if (status === 'partial' || status === 'degraded') return 'warn'
  if (status === 'error') return 'danger'
  return 'muted'
}

function findIntegration(list: IntegrationCard[] | undefined, match: RegExp) {
  return list?.find((i) => match.test(`${i.id} ${i.name} ${i.summary || ''}`))
}

function statusLabel(status?: string, summary?: string) {
  if (status === 'connected') return 'CONNECTED'
  if (status === 'partial') return 'PARTIAL'
  if (status === 'error') return 'ERROR'
  if (status === 'disabled') return 'DISABLED'
  if (status === 'not_connected') return 'NOT CONFIGURED'
  if (summary?.toLowerCase().includes('not configured')) return 'NOT CONFIGURED'
  return status?.toUpperCase() || 'UNKNOWN'
}

export function JarvisSystemStatus({
  dashboard,
  compact,
}: {
  dashboard: JarvisDashboard | null
  compact?: boolean
}) {
  const integrations = dashboard?.integrations
  const execution = dashboard?.execution
  const realtime = dashboard?.realtime as { status?: string; enabled?: boolean } | undefined

  const openai = findIntegration(integrations, /openai|llm|ai/i)
  const supabase = findIntegration(integrations, /supabase/i)
  const meta = findIntegration(integrations, /meta/i)
  const ig = findIntegration(integrations, /instagram/i)
  const shotstack = findIntegration(integrations, /shotstack|video/i)
  const brave = findIntegration(integrations, /brave|research/i)

  const rows: Row[] = [
    {
      name: 'OPENAI',
      label: statusLabel(openai?.status, openai?.summary),
      tone: integrationTone(openai?.status),
    },
    {
      name: 'SUPABASE',
      label: statusLabel(supabase?.status, supabase?.summary) === 'UNKNOWN' ? 'CONNECTED' : statusLabel(supabase?.status, supabase?.summary),
      tone: integrationTone(supabase?.status) === 'muted' ? 'ok' : integrationTone(supabase?.status),
    },
    {
      name: 'META',
      label: execution?.live_meta_execution ? 'LIVE' : 'READ ONLY',
      tone: execution?.live_meta_execution ? 'warn' : 'ok',
    },
    {
      name: 'INSTAGRAM',
      label: execution?.live_instagram_publishing ? 'LIVE' : 'READ ONLY',
      tone: execution?.live_instagram_publishing ? 'warn' : 'ok',
    },
    {
      name: 'SHOTSTACK',
      label: statusLabel(shotstack?.status, shotstack?.summary),
      tone: integrationTone(shotstack?.status),
    },
    {
      name: 'BRAVE',
      label: statusLabel(brave?.status, brave?.summary),
      tone: integrationTone(brave?.status),
    },
    {
      name: 'VOICE',
      label: realtime?.enabled ? (realtime.status || 'READY').toUpperCase() : 'DISABLED',
      tone: realtime?.enabled ? 'ok' : 'muted',
    },
  ]

  return (
    <section style={{ ...glassPanel, padding: compact ? 10 : 12 }} aria-label="System status">
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
        Systems
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr 1fr' : '1fr 1fr',
          gap: '6px 12px',
          marginTop: 8,
        }}
      >
        {rows.map((r) => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span style={statusDot(r.tone)} />
            <span style={{ color: j2.muted, letterSpacing: '0.06em', minWidth: 72 }}>{r.name}</span>
            <span style={{ color: j2.text }}>{r.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
