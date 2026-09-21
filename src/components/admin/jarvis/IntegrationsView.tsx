'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'
import type { CapabilityGroup, IntegrationCard, IntegrationStatus } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import * as s from './styles'

const GROUPS: CapabilityGroup[] = ['WORKING', 'WAITING FOR INTEGRATION', 'REQUIRES APPROVAL', 'BLOCKED']

function statusEmoji(status: IntegrationStatus) {
  if (status === 'connected') return '🟢'
  if (status === 'error') return '🔴'
  if (status === 'partial') return '🟡'
  return '⚪'
}

function statusLabel(status: IntegrationStatus) {
  if (status === 'connected') return 'Connected'
  if (status === 'error') return 'Error'
  if (status === 'partial') return 'Partial'
  if (status === 'disabled') return 'Disabled'
  return 'Not connected'
}

export function IntegrationsView({ jarvis }: { jarvis: JarvisCommandState }) {
  const cards = jarvis.dashboard?.integrations ?? []
  const capabilities = jarvis.dashboard?.capabilities
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})
  const [configureId, setConfigureId] = useState<string | null>(null)
  const connectedCount = cards.filter((card) => card.status === 'connected').length
  const missingCount = cards.length - connectedCount

  async function test(card: IntegrationCard) {
    if (!card.testable) return
    setTesting(card.id)
    try {
      const res = await fetch('/api/admin/jarvis/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id }),
      })
      const json = await res.json()
      setResults((prev) => ({
        ...prev,
        [card.id]: json.result?.message || json.error || 'No result',
      }))
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [card.id]: e instanceof Error ? e.message : 'Test failed',
      }))
    } finally {
      setTesting(null)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20 }}>
      <div style={s.eyebrow}>System health</div>
      <h1 style={{ margin: '6px 0 8px', fontSize: 22, letterSpacing: '-0.03em' }}>What Jarvis is connected to</h1>
      <p style={{ ...s.muted, marginBottom: 16, maxWidth: 640 }}>
        {connectedCount} connected · {missingCount} need setup. Credentials never appear here. Configure means naming
        the server environment variables — Jarvis cannot store secrets from this UI.
      </p>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {cards.map((card) => (
          <div key={card.id} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div style={{ fontWeight: 800 }}>{card.name}</div>
              <span style={s.badge(card.status === 'connected' ? 'ok' : card.status === 'error' ? 'danger' : 'muted')}>
                {statusEmoji(card.status)} {statusLabel(card.status)}
              </span>
            </div>
            <div style={s.muted}>{card.summary}</div>
            {card.can_do.length ? (
              <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 13, color: colors.textSecondary }}>
                {card.can_do.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {card.cannot_do.length ? (
              <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12, color: colors.textMuted }}>
                {card.cannot_do.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {card.testable ? (
                <button type="button" style={s.ghostBtn} disabled={testing === card.id} onClick={() => void test(card)}>
                  {testing === card.id ? 'Testing…' : 'Test connection'}
                </button>
              ) : null}
              {card.configure_hint ? (
                <button type="button" style={s.ghostBtn} onClick={() => setConfigureId(card.id === configureId ? null : card.id)}>
                  Configure
                </button>
              ) : null}
            </div>
            {configureId === card.id && card.configure_hint ? (
              <div style={{ ...s.muted, marginTop: 10 }}>{card.configure_hint}</div>
            ) : null}
            {results[card.id] ? <div style={{ ...s.muted, marginTop: 8 }}>{results[card.id]}</div> : null}
          </div>
        ))}
      </div>

      <div style={{ ...s.eyebrow, margin: '28px 0 8px' }}>WHAT JARVIS CAN DO</div>
      <p style={{ ...s.muted, marginBottom: 12 }}>
        Generated from registered tools, the permission engine, and current integration status. Nothing here is a fake
        capability.
      </p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {GROUPS.map((group) => {
          const items = capabilities?.[group] ?? []
          return (
            <div key={group} style={s.card}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{group}</div>
              <div style={s.muted}>{items.length} {items.length === 1 ? 'item' : 'items'}</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
                {items.length ? (
                  items.map((item) => (
                    <div key={`${group}-${item.tool || item.title}`}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
                      <div style={s.muted}>{item.detail}</div>
                    </div>
                  ))
                ) : (
                  <div style={s.muted}>None in this group right now.</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
