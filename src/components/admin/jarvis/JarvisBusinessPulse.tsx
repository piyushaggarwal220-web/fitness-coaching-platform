'use client'

import type { CockpitMetric } from '@/lib/jarvis/operator-cockpit'
import type { CommandView } from './types'
import { j2, glassPanel } from './styles'

function metricColor(status: CockpitMetric['status']) {
  if (status === 'error') return 'rgba(248, 113, 113, 0.95)'
  if (status === 'unavailable' || status === 'stale') return j2.muted
  return j2.text
}

export function JarvisBusinessPulse({
  metrics,
  onNavigate,
  compact,
}: {
  metrics: CockpitMetric[]
  onNavigate: (view: CommandView) => void
  compact?: boolean
}) {
  return (
    <section style={{ ...glassPanel, padding: compact ? '8px 10px' : '10px 12px' }} aria-label="Business pulse">
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
        Business pulse
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'repeat(2, 1fr)' : `repeat(${Math.min(metrics.length, 6)}, minmax(0, 1fr))`,
          gap: 0,
          marginTop: 6,
        }}
      >
        {metrics.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onNavigate(m.view)}
            style={{
              textAlign: 'left',
              background: 'none',
              border: 'none',
              borderLeft: !compact && i > 0 ? `1px solid ${j2.glassBorder}` : 'none',
              padding: '6px 8px',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: '0.12em', color: j2.muted, textTransform: 'uppercase' }}>
              {m.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: metricColor(m.status), letterSpacing: '-0.03em' }}>
              {m.display}
            </div>
            <div style={{ fontSize: 10, marginTop: 2, color: j2.muted }}>
              {m.change_label || m.period}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
