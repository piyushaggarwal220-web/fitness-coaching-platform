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

/**
 * Compact Business Pulse — available metrics in a tight 2-col grid;
 * Meta/unavailable collapsed to one muted line (never giant empty cards).
 */
export function JarvisBusinessPulse({
  metrics,
  onNavigate,
  compact,
  layout = 'grid',
  preferData = true,
}: {
  metrics: CockpitMetric[]
  onNavigate: (view: CommandView) => void
  compact?: boolean
  layout?: 'grid' | 'list'
  preferData?: boolean
}) {
  const available = metrics.filter((m) => !isUnavailable(m))
  const unavailable = metrics.filter((m) => isUnavailable(m))
  const metaUnavailable = unavailable.filter((m) => m.source === 'META')
  const otherUnavailable = unavailable.filter((m) => m.source !== 'META')

  const show = preferData ? available : metrics

  return (
    <section aria-label="Business pulse" style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: j2.muted,
          fontWeight: 650,
        }}
      >
        Business pulse
      </div>

      {layout === 'list' ? (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {[...available, ...(preferData ? otherUnavailable : [])].map((m) => (
            <MetricListRow key={m.id} m={m} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 6,
            marginTop: 8,
          }}
        >
          {show.map((m) => (
            <MetricCard key={m.id} m={m} onNavigate={onNavigate} dense={compact} />
          ))}
        </div>
      )}

      {preferData && (metaUnavailable.length > 0 || otherUnavailable.length > 0) ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {metaUnavailable.length ? (
            <button
              type="button"
              onClick={() => onNavigate('marketing')}
              style={compactUnavailableBtn}
            >
              Meta · Unavailable
            </button>
          ) : null}
          {otherUnavailable.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onNavigate(m.view)}
              style={compactUnavailableBtn}
            >
              {m.label} · Unavailable
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

const compactUnavailableBtn = {
  width: '100%' as const,
  textAlign: 'left' as const,
  background: 'none' as const,
  border: 'none' as const,
  padding: '2px 0',
  cursor: 'pointer' as const,
  fontSize: 11,
  color: j2.muted,
  lineHeight: 1.35,
}

function MetricCard({
  m,
  onNavigate,
  dense,
}: {
  m: CockpitMetric
  onNavigate: (view: CommandView) => void
  dense?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(m.view)}
      style={{
        textAlign: 'left',
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${j2.glassBorder}`,
        borderRadius: 8,
        padding: dense ? '7px 8px' : '8px 9px',
        cursor: 'pointer',
        color: 'inherit',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.08em',
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
          fontSize: dense ? 14 : 15,
          fontWeight: 700,
          marginTop: 2,
          color: metricColor(m.status),
          letterSpacing: '-0.03em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {isUnavailable(m) ? '—' : m.display}
      </div>
      {!isUnavailable(m) && (m.change_label || m.period) ? (
        <div
          style={{
            fontSize: 10,
            marginTop: 2,
            color: j2.muted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {m.change_label || m.period}
        </div>
      ) : null}
    </button>
  )
}

function MetricListRow({ m, onNavigate }: { m: CockpitMetric; onNavigate: (view: CommandView) => void }) {
  return (
    <li style={{ padding: '6px 0', borderBottom: `1px solid ${j2.glassBorder}`, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => onNavigate(m.view)}
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          gap: 10,
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
        <span
          style={{
            fontSize: 10,
            color: j2.muted,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {m.label}
        </span>
        <span
          style={{
            fontSize: 13,
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
          {isUnavailable(m) ? 'Unavailable' : m.display}
        </span>
      </button>
    </li>
  )
}
