'use client'

/**
 * Local visual QA surface for the dense Jarvis Command Center (pre-orb restoration).
 * Dev-only — not linked from production nav.
 */

import { useState } from 'react'
import type { JarvisCoreState } from '@/lib/jarvis/operator-present'
import { CommandBar } from '@/components/admin/jarvis/CommandBar'
import { colors } from '@/lib/design-tokens'
import * as s from '@/components/admin/jarvis/styles'
import type { CockpitMetric } from '@/lib/jarvis/operator-cockpit'

function m(
  partial: Omit<CockpitMetric, 'value' | 'change_pct' | 'hint'> &
    Partial<Pick<CockpitMetric, 'value' | 'change_pct' | 'hint'>>
): CockpitMetric {
  return {
    value: null,
    change_pct: null,
    hint: '',
    ...partial,
  }
}

const METRICS: CockpitMetric[] = [
  m({
    id: 'revenue',
    label: 'Revenue',
    display: '₹4,397',
    change_label: '3 paid sales',
    period: 'today',
    status: 'ok',
    status_label: 'ok',
    source: 'LURVOX',
    view: 'revenue',
    value: 4397,
  }),
  m({
    id: 'orders',
    label: 'Paid sales',
    display: '3',
    change_label: null,
    period: 'today',
    status: 'ok',
    status_label: 'ok',
    source: 'LURVOX',
    view: 'revenue',
    value: 3,
  }),
  m({
    id: 'aov',
    label: 'AOV',
    display: '₹1,465',
    change_label: null,
    period: 'today',
    status: 'ok',
    status_label: 'ok',
    source: 'LURVOX',
    view: 'revenue',
    value: 1465,
  }),
  m({
    id: 'spend',
    label: 'Ad spend',
    display: '—',
    change_label: null,
    period: 'today',
    status: 'unavailable',
    status_label: 'unavailable',
    source: 'META',
    view: 'marketing',
  }),
  m({
    id: 'cpa',
    label: 'CPA',
    display: '—',
    change_label: null,
    period: 'today',
    status: 'unavailable',
    status_label: 'unavailable',
    source: 'META',
    view: 'marketing',
  }),
  m({
    id: 'roas',
    label: 'ROAS',
    display: '—',
    change_label: null,
    period: 'today',
    status: 'unavailable',
    status_label: 'unavailable',
    source: 'META',
    view: 'marketing',
  }),
]

const STATES: JarvisCoreState[] = [
  'IDLE',
  'THINKING',
  'RESEARCHING',
  'CREATING',
  'RENDERING',
  'WAITING_FOR_APPROVAL',
  'COMPLETED',
  'ERROR',
]

const NAV = ['Command Center', 'Chat', 'Revenue', 'Video', 'Approvals', 'Integrations']

export default function JarvisVisualQaPage() {
  const [state, setState] = useState<JarvisCoreState>('IDLE')
  const [input, setInput] = useState('')
  const [width, setWidth] = useState(1440)

  if (process.env.NODE_ENV === 'production') {
    return <div style={{ padding: 24, color: '#fff' }}>Not available in production.</div>
  }

  const statusTone =
    state === 'ERROR'
      ? colors.danger
      : state === 'WAITING_FOR_APPROVAL'
        ? colors.warning
        : state === 'IDLE' || state === 'COMPLETED'
          ? colors.textMuted
          : colors.success

  return (
    <div style={{ background: '#070708', minHeight: '100vh', color: colors.textPrimary, padding: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {STATES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setState(st)}
            style={{
              background: state === st ? 'rgba(255,98,0,0.15)' : 'transparent',
              border: `1px solid ${colors.borderSubtle}`,
              color: colors.textPrimary,
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {st}
          </button>
        ))}
        {[1280, 1440, 1920].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            style={{
              background: width === w ? 'rgba(125,211,252,0.12)' : 'transparent',
              border: `1px solid ${colors.borderSubtle}`,
              color: colors.textMuted,
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {w} px
          </button>
        ))}
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: width,
          margin: '0 auto',
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: 8,
          overflow: 'hidden',
          minHeight: 720,
          display: 'grid',
          gridTemplateColumns: '196px minmax(0, 1fr) 280px',
          gridTemplateRows: '44px 1fr auto',
          background: '#070708',
        }}
      >
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 14px',
            borderBottom: `1px solid ${colors.borderSubtle}`,
            background: '#0a0a0c',
            fontSize: 12,
          }}
        >
          <strong style={{ letterSpacing: '-0.04em' }}>JARVIS</strong>
          <span style={s.statusDot(state === 'ERROR' ? 'danger' : state === 'WAITING_FOR_APPROVAL' ? 'warn' : 'ok')} />
          <span>Operational · 5 connected</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: colors.textMuted }}>Approvals 1 · Cost $0.12</span>
        </div>

        <aside
          style={{
            borderRight: `1px solid ${colors.borderSubtle}`,
            background: '#0b0b0d',
            padding: '10px 0',
            overflow: 'auto',
          }}
        >
          <div style={{ ...s.eyebrow, padding: '0 14px' }}>LURVOX</div>
          <div style={{ ...s.brandTitle, padding: '0 14px 8px' }}>JARVIS</div>
          {NAV.map((label, i) => (
            <div
              key={label}
              style={{
                ...s.navBtn(i === 0),
                pointerEvents: 'none',
              }}
            >
              {label}
            </div>
          ))}
        </aside>

        <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: '#09090b' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.04em' }}>Good afternoon.</div>
              <span style={{ ...s.badge(state === 'WAITING_FOR_APPROVAL' ? 'warn' : state === 'ERROR' ? 'danger' : 'muted') }}>
                <span
                  style={{
                    ...s.statusDot(
                      state === 'ERROR' ? 'danger' : state === 'WAITING_FOR_APPROVAL' ? 'warn' : state === 'IDLE' ? 'muted' : 'ok'
                    ),
                    marginRight: 6,
                  }}
                />
                {state.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ color: colors.textSecondary, marginTop: 3, fontSize: 12 }}>
              Dense operator console — metrics, video ops, approvals, and command input without a hero orb.
            </div>
            {state !== 'IDLE' ? (
              <div style={{ marginTop: 4, fontSize: 11, color: statusTone }}>
                {state === 'RENDERING'
                  ? 'Waiting for render provider'
                  : state === 'CREATING'
                    ? 'Analyzing footage'
                    : state === 'WAITING_FOR_APPROVAL'
                      ? 'Waiting for your approval'
                      : state}
              </div>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                marginTop: 10,
                borderTop: `1px solid ${colors.borderSubtle}`,
                borderBottom: `1px solid ${colors.borderSubtle}`,
              }}
            >
              {METRICS.map((metric, i) => (
                <div
                  key={metric.id}
                  style={{
                    padding: '6px 8px',
                    borderLeft: i > 0 ? `1px solid ${colors.divider}` : 'none',
                  }}
                >
                  <div style={{ fontSize: 9, letterSpacing: '0.12em', color: colors.textMuted, textTransform: 'uppercase' }}>
                    {metric.label}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{metric.display}</div>
                  <div style={{ fontSize: 10, marginTop: 2, color: colors.textMuted }}>
                    {metric.change_label || metric.period}
                  </div>
                  <div style={{ fontSize: 9, marginTop: 1, color: colors.textMuted }}>
                    {metric.source} · {metric.status_label}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, paddingBottom: 8, borderBottom: `1px solid ${colors.divider}` }}>
              <div style={s.sectionLabel}>Video operations</div>
              <div style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
                Footage session · analyzing · 2 sources · 4 opportunities
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
                Plan · High-protein dessert Reel · draft
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: colors.textSecondary }}>
                Render · {state === 'RENDERING' ? 'rendering' : 'queued'} · 9:16
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 14,
                marginTop: 10,
              }}
            >
              <section>
                <div style={s.sectionLabel}>What changed</div>
                <div style={{ fontSize: 12, fontWeight: 650 }}>3 paid sales today</div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>LURVOX ledger · IST window</div>
              </section>
              <section>
                <div style={s.sectionLabel}>Needs attention</div>
                <div style={{ fontSize: 12, fontWeight: 650 }}>Meta sync issue</div>
                <div style={{ ...s.muted, fontSize: 11 }}>Read-only Meta sync has no recent data.</div>
              </section>
              <section>
                <div style={s.sectionLabel}>Jarvis recommends</div>
                <div style={{ fontSize: 12, fontWeight: 650 }}>Investigate Meta gap</div>
                <div style={s.muted}>Risk · low · read-only</div>
              </section>
            </div>
          </div>
        </main>

        <aside
          style={{
            borderLeft: `1px solid ${colors.borderSubtle}`,
            background: '#0b0b0d',
            padding: 12,
            overflow: 'auto',
            fontSize: 12,
          }}
        >
          <div style={s.eyebrow}>LIVE OPS</div>
          <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>Today</div>
          <div style={{ ...s.card, marginTop: 10, padding: 10 }}>
            <div style={s.eyebrow}>BUSINESS PULSE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: colors.textMuted }}>Revenue</div>
                <div style={{ fontWeight: 700 }}>₹4,397</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: colors.textMuted }}>Paid sales</div>
                <div style={{ fontWeight: 700 }}>3</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: colors.textMuted }}>Ad spend</div>
                <div style={{ fontWeight: 700, color: colors.textMuted }}>Unavailable</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: colors.textMuted }}>ROAS</div>
                <div style={{ fontWeight: 700, color: colors.textMuted }}>Unavailable</div>
              </div>
            </div>
          </div>
          <div style={{ ...s.card, marginTop: 10, padding: 10, borderColor: 'rgba(245,158,11,0.35)' }}>
            <div style={s.eyebrow}>ACTION</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>Publish Instagram Reel</div>
            <div style={{ marginTop: 6 }}>
              <div style={s.eyebrow}>WHY</div>
              <div style={{ color: colors.textSecondary, marginTop: 2 }}>Significant write — confirmation required.</div>
            </div>
            <div style={{ ...s.muted, marginTop: 6 }}>TARGET · Instagram</div>
            <span style={{ ...s.badge('warn'), marginTop: 6 }}>RISK · significant</span>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button type="button" style={{ ...s.solidBtn, padding: '6px 10px', fontSize: 12 }}>
                Approve
              </button>
              <button type="button" style={{ ...s.dangerBtn, padding: '6px 10px', fontSize: 12 }}>
                Reject
              </button>
            </div>
          </div>
        </aside>

        <div
          style={{
            gridColumn: '1 / -1',
            ...s.composerDock,
          }}
        >
          <CommandBar
            value={input}
            onChange={setInput}
            onSubmit={() => setInput('')}
            voiceStatus="off"
            voiceTitle="JARVIS_REALTIME_ENABLED is not true. Text Jarvis remains available."
            showChips
            onAttach={() => undefined}
            attachTitle="Attach raw footage (private ingest)"
          />
        </div>
      </div>
    </div>
  )
}
