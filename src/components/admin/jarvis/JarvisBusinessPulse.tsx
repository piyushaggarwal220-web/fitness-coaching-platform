'use client'

import type { CockpitMetric } from '@/lib/jarvis/operator-cockpit'
import type { CommandView } from './types'
import { j2 } from './styles'

function metricColor(status: CockpitMetric['status']) {
  if (status === 'error') return 'rgba(248, 113, 113, 0.95)'
  if (status === 'unavailable' || status === 'stale') return j2.muted
  return j2.text
}

function isUnavailable(m: CockpitMetric) {
  return m.status === 'unavailable' || m.status === 'error' || m.status === 'stale'
}

export function JarvisBusinessPulse({
  metrics,
  onNavigate,
  compact,
  layout = 'grid',
  preferData,
}: {
  metrics: CockpitMetric[]
  onNavigate: (view: CommandView) => void
  compact?: boolean
  layout?: 'grid' | 'list'
  /** Show metrics with data first; collapse unavailable into one muted line */
  preferData?: boolean
}) {
  const available = metrics.filter((m) => !isUnavailable(m))
  const unavailable = metrics.filter((m) => isUnavailable(m))
  const ordered = preferData
    ? available
    : [...metrics].sort((a, b) => Number(isUnavailable(a)) - Number(isUnavailable(b)))

  const metaUnavailable = unavailable.filter((m) => m.source === 'META')
  const otherUnavailable = preferData ? unavailable.filter((m) => m.source !== 'META') : []

  return (
    <section aria-label="Business pulse" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
        Business pulse
      </div>
      {layout === 'list' ? (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
          {(preferData ? [...available, ...otherUnavailable] : ordered).map((m) => (
            <MetricListRow key={m.id} m={m} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
            marginTop: 10,
          }}
        >
          {(preferData ? available : ordered).map((m) => (
            <MetricCard key={m.id} m={m} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {preferData && metaUnavailable.length ? (
        <button
          type="button"
          onClick={() => onNavigate('marketing')}
          style={{
            marginTop: 10,
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 11,
            color: j2.muted,
          }}
        >
          Meta metrics · Unavailable
        </button>
      ) : null}
      {!preferData && unavailable.length && layout === 'grid' ? null : null}
      {compact ? null : null}
    </section>
  )
}

function MetricCard({ m, onNavigate }: { m: CockpitMetric; onNavigate: (view: CommandView) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(m.view)}
      style={{
        textAlign: 'left',
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${j2.glassBorder}`,
        borderRadius: 10,
        padding: '10px 10px',
        cursor: 'pointer',
        color: 'inherit',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.1em',
          color: j2.muted,
          textTransform: 'uppercase',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {m.label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          marginTop: 4,
          color: metricColor(m.status),
          letterSpacing: '-0.03em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {isUnavailable(m) ? '—' : m.display}
      </div>
      <div
        style={{
          fontSize: 10,
          marginTop: 3,
          color: j2.muted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {isUnavailable(m) ? 'Unavailable' : m.change_label || m.period}
      </div>
    </button>
  )
}

function MetricListRow({ m, onNavigate }: { m: CockpitMetric; onNavigate: (view: CommandView) => void }) {
  return (
    <li style={{ padding: '8px 0', borderBottom: `1px solid ${j2.glassBorder}`, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => onNavigate(m.view)}
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'baseline',
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 11, color: j2.muted, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
          {m.label}
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: metricColor(m.status),
            letterSpacing: '-0.03em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            textAlign: 'right',
          }}
        >
          {isUnavailable(m) ? '—' : m.display}
        </span>
      </button>
      <div style={{ fontSize: 10, color: j2.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {isUnavailable(m) ? `${m.source} unavailable` : m.change_label || m.period}
      </div>
    </li>
  )
}
