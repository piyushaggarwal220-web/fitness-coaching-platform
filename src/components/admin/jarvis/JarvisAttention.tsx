'use client'

import type { AttentionItem } from '@/lib/jarvis/operator-cockpit'
import type { CommandView } from './types'
import { j2, glassPanel } from './styles'

function severityTone(sev: string) {
  const s = sev.toUpperCase()
  if (s === 'CRITICAL' || s === 'INCIDENT' || s === 'BLOCKED' || s === 'URGENT')
    return { fg: 'rgba(248, 113, 113, 0.95)', label: s === 'INCIDENT' ? 'CRITICAL' : s === 'BLOCKED' ? 'CRITICAL' : 'CRITICAL' }
  if (s === 'IMPORTANT' || s === 'WARNING' || s === 'APPROVAL' || s === 'DECISION' || s === 'DATA GAP')
    return { fg: 'rgba(251, 191, 36, 0.95)', label: 'IMPORTANT' }
  if (s === 'WATCH') return { fg: j2.cyan, label: 'WATCH' }
  return { fg: j2.muted, label: 'INFO' }
}

export function JarvisAttention({
  items,
  autonomous,
  onNavigate,
  onAsk,
}: {
  items: AttentionItem[]
  autonomous?: { severity: string; system: string; title: string; next_action: string }[]
  onNavigate: (view: CommandView) => void
  onAsk?: (prompt: string) => void
}) {
  const rows: { key: string; sev: string; title: string; next?: string; action?: AttentionItem['action'] }[] = [
    ...items.map((a) => ({
      key: a.id,
      sev: a.category || 'INFO',
      title: a.title,
      next: a.detail,
      action: a.action,
    })),
    ...(autonomous || []).map((a, i) => ({
      key: `auto-${a.system}-${i}`,
      sev: a.severity,
      title: `${a.system} — ${a.title}`,
      next: a.next_action,
    })),
  ].slice(0, 8)

  if (!rows.length) {
    return (
      <section style={{ ...glassPanel, padding: 14 }} aria-label="Attention">
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
          Attention
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: j2.muted }}>Nothing urgent.</div>
      </section>
    )
  }

  return (
    <section style={{ ...glassPanel, padding: 14 }} aria-label="Attention">
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
        Attention
      </div>
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
        {rows.map((row) => {
          const tone = severityTone(row.sev)
          return (
            <li key={row.key} style={{ padding: '8px 0', borderBottom: `1px solid ${j2.glassBorder}` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, letterSpacing: '0.08em', color: tone.fg, fontWeight: 700 }}>{tone.label}</span>
                <span style={{ fontSize: 13, color: j2.text, fontWeight: 600 }}>{row.title}</span>
              </div>
              {row.next ? <div style={{ fontSize: 12, color: j2.muted, marginTop: 3 }}>{row.next}</div> : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                {row.action === 'review' ? (
                  <button type="button" style={linkBtn} onClick={() => onNavigate('approvals')}>
                    Review approvals
                  </button>
                ) : null}
                {row.action === 'diagnostics' ? (
                  <button type="button" style={linkBtn} onClick={() => onNavigate('diagnostics')}>
                    Diagnostics
                  </button>
                ) : null}
                {onAsk ? (
                  <button
                    type="button"
                    style={linkBtn}
                    onClick={() => onAsk(`Investigate: ${row.title}`)}
                  >
                    Investigate
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const linkBtn = {
  background: 'none' as const,
  border: 'none' as const,
  color: j2.amber,
  fontSize: 12,
  cursor: 'pointer' as const,
  padding: 0,
}
