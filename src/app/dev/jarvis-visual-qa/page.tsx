'use client'

/**
 * Local visual QA surface for Jarvis 2.0 layout.
 * Dev-only — not linked from production nav.
 */

import { useMemo, useState } from 'react'
import type { JarvisCoreState } from '@/lib/jarvis/operator-present'
import { coreHeadline } from '@/lib/jarvis/operator-present'
import { JarvisCore } from '@/components/admin/jarvis/JarvisCore'
import { JarvisBusinessPulse } from '@/components/admin/jarvis/JarvisBusinessPulse'
import { JarvisAttention } from '@/components/admin/jarvis/JarvisAttention'
import { CommandBar } from '@/components/admin/jarvis/CommandBar'
import { j2 } from '@/components/admin/jarvis/styles'
import type { CockpitMetric } from '@/lib/jarvis/operator-cockpit'

function m(
  partial: Omit<CockpitMetric, 'value' | 'change_pct' | 'hint'> & Partial<Pick<CockpitMetric, 'value' | 'change_pct' | 'hint'>>
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
    display: '₹3,398',
    change_label: '2 paid sales',
    period: 'today',
    status: 'ok',
    status_label: 'ok',
    source: 'LURVOX',
    view: 'revenue',
    value: 3398,
  }),
  m({
    id: 'aov',
    label: 'AOV',
    display: '₹1,699',
    change_label: null,
    period: 'today',
    status: 'ok',
    status_label: 'ok',
    source: 'LURVOX',
    view: 'revenue',
    value: 1699,
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
  m({
    id: 'orders',
    label: 'Orders',
    display: '2',
    change_label: null,
    period: 'today',
    status: 'ok',
    status_label: 'ok',
    source: 'LURVOX',
    view: 'revenue',
    value: 2,
  }),
]

const STATES: JarvisCoreState[] = [
  'IDLE',
  'LISTENING',
  'THINKING',
  'WAITING_FOR_APPROVAL',
  'CREATING',
  'RENDERING',
  'COMPLETED',
  'ERROR',
]

export default function JarvisVisualQaPage() {
  const [state, setState] = useState<JarvisCoreState>('IDLE')
  const [input, setInput] = useState('')
  const [width, setWidth] = useState(1440)

  const headline = useMemo(() => coreHeadline(state, 'Good afternoon.'), [state])

  if (process.env.NODE_ENV === 'production') {
    return <div style={{ padding: 24, color: '#fff' }}>Not available in production.</div>
  }

  return (
    <div style={{ background: j2.bg, minHeight: '100vh', color: j2.text, padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            style={{
              background: state === s ? j2.amberSoft : 'transparent',
              border: `1px solid ${j2.glassBorder}`,
              color: j2.text,
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
        {[1280, 1440, 1920].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            style={{
              background: width === w ? 'rgba(125,211,252,0.15)' : 'transparent',
              border: `1px solid ${j2.glassBorder}`,
              color: j2.muted,
              borderRadius: 8,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {w}px
          </button>
        ))}
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: width,
          margin: '0 auto',
          border: `1px solid ${j2.glassBorder}`,
          borderRadius: 16,
          overflow: 'hidden',
          minHeight: 720,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 0.9fr)',
          gap: 0,
          background: `
            radial-gradient(ellipse 55% 45% at 50% 38%, rgba(255,98,0,0.07), transparent 70%),
            ${j2.bg}
          `,
        }}
      >
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <JarvisCore
            state={state}
            headline={headline}
            detail={state === 'IDLE' ? 'What should I take care of?' : undefined}
            size={width >= 1440 ? 300 : 240}
          />
        </div>
        <div style={{ padding: 12, borderLeft: `1px solid ${j2.glassBorder}`, overflow: 'auto' }}>
          {state === 'WAITING_FOR_APPROVAL' ? (
            <div style={{ padding: 12, color: j2.muted, fontSize: 13 }}>Approval panel (contextual)</div>
          ) : state === 'ERROR' ? (
            <div style={{ padding: 12, color: 'rgba(248,113,113,0.95)', fontSize: 13 }}>Action required</div>
          ) : (
            <>
              <JarvisAttention
                items={[
                  {
                    id: '1',
                    category: 'WARNING',
                    title: 'Meta sync issue',
                    detail: 'Read-only Meta sync is not producing recent data for the active window.',
                    action: 'diagnostics',
                  },
                ]}
                onNavigate={() => undefined}
                dense
              />
              <div style={{ height: 12 }} />
              <JarvisBusinessPulse metrics={METRICS} onNavigate={() => undefined} layout="grid" />
            </>
          )}
        </div>
        <div style={{ gridColumn: '1 / -1', padding: 16, borderTop: `1px solid ${j2.glassBorder}` }}>
          <CommandBar
            value={input}
            onChange={setInput}
            onSubmit={() => setInput('')}
            voiceStatus="off"
            voiceTitle="JARVIS_REALTIME_ENABLED is not true. Text Jarvis remains available."
            showChips
            chips={[
              { id: 'reel', label: 'Create Reel', prompt: 'reel' },
              { id: 'ad', label: 'Create Ad', prompt: 'ad' },
              { id: 'analyze', label: 'Analyze', prompt: 'analyze' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
