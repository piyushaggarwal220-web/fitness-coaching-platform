'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { formatTime } from '@/lib/jarvis/operator-present'
import type { CockpitMetric, ChangeCard, AttentionItem, OperatorState } from '@/lib/jarvis/operator-cockpit'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { CommandBar } from './CommandBar'
import { ExecutiveChart } from './Sparkline'
import * as s from './styles'

function metricColor(status: CockpitMetric['status']) {
  if (status === 'error') return colors.danger
  if (status === 'unavailable' || status === 'stale') return colors.textMuted
  return colors.textPrimary
}

function changeColor(label: string | null, status: CockpitMetric['status']) {
  if (status === 'unavailable' || status === 'error' || status === 'stale') return colors.textMuted
  if (!label) return colors.textMuted
  if (label.startsWith('+')) return colors.success
  if (label.startsWith('-') && label.includes('%')) return colors.danger
  return colors.textMuted
}

function toneColor(tone: ChangeCard['tone']) {
  if (tone === 'up') return colors.success
  if (tone === 'down' || tone === 'warn') return colors.warning
  return colors.textMuted
}

function stateColor(state: OperatorState) {
  if (state === 'Failed' || state === 'Blocked') return colors.danger
  if (state === 'Waiting for approval') return colors.warning
  if (state === 'Completed' || state === 'Idle') return colors.textMuted
  return colors.success
}

function actionLabel(item: AttentionItem) {
  if (item.action === 'review') return 'Review approvals →'
  if (item.action === 'diagnostics') return 'View diagnostics →'
  if (item.action === 'integrations') return 'Open integrations →'
  return null
}

export function CockpitHome({
  jarvis,
  onNavigate,
  compact,
}: {
  jarvis: JarvisCommandState
  onNavigate: (view: CommandView) => void
  compact?: boolean
}) {
  const cockpit = jarvis.dashboard?.cockpit
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  if (!cockpit) {
    return (
      <div style={{ padding: 16 }}>
        <div style={s.eyebrow}>Command Center</div>
        <div style={{ marginTop: 6, color: colors.textMuted }}>Loading business state…</div>
      </div>
    )
  }

  const goAttention = (item: AttentionItem) => {
    if (item.action === 'review') onNavigate('approvals')
    else if (item.action === 'diagnostics') onNavigate('diagnostics')
    else if (item.action === 'integrations') onNavigate('integrations')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '8px 10px 4px' : '8px 16px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: compact ? 16 : 17, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.2 }}>
              {cockpit.greeting}
            </div>
            <div style={{ color: colors.textSecondary, marginTop: 3, fontSize: 12, lineHeight: 1.35 }}>
              {cockpit.brief}
            </div>
          </div>
          <div style={{ fontSize: 10, color: colors.textMuted, textAlign: 'right', flexShrink: 0, lineHeight: 1.3 }}>
            {cockpit.date_label}
            <div>{cockpit.timezone}</div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(6, minmax(0, 1fr))',
            marginTop: 8,
            borderTop: `1px solid ${colors.borderSubtle}`,
            borderBottom: `1px solid ${colors.borderSubtle}`,
          }}
        >
          {cockpit.metrics.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onNavigate(m.view)}
              style={{
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderLeft: !compact && i > 0 ? `1px solid ${colors.divider}` : 'none',
                padding: '6px 8px',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <div style={{ fontSize: 9, letterSpacing: '0.12em', color: colors.textMuted, textTransform: 'uppercase' }}>
                {m.label}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2, color: metricColor(m.status), letterSpacing: '-0.03em' }}>
                {m.display}
              </div>
              <div style={{ fontSize: 10, marginTop: 2, color: changeColor(m.change_label, m.status) }}>
                {m.change_label || m.period}
              </div>
              <div style={{ fontSize: 9, marginTop: 1, color: colors.textMuted, letterSpacing: '0.04em' }}>
                {m.source} · {m.status_label}
              </div>
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : '1fr 1fr 1fr',
            gap: compact ? 10 : 14,
            marginTop: 8,
            paddingBottom: 6,
            borderBottom: `1px solid ${colors.divider}`,
          }}
        >
          <div>
            <div style={s.sectionLabel}>Revenue · 7D</div>
            {cockpit.charts.revenue_7d.length > 1 ? (
              <ExecutiveChart points={cockpit.charts.revenue_7d} unit="₹" height={48} />
            ) : (
              <div style={s.muted}>No verified LURVOX points for this period.</div>
            )}
          </div>
          <div>
            <div style={s.sectionLabel}>Paid sales · 7D</div>
            {cockpit.charts.sales_7d.length > 1 ? (
              <ExecutiveChart points={cockpit.charts.sales_7d} height={48} />
            ) : (
              <div style={s.muted}>No verified LURVOX points for this period.</div>
            )}
          </div>
          <div>
            <div style={s.sectionLabel}>Meta performance</div>
            {cockpit.charts.ads_7d && cockpit.charts.ads_7d.length > 1 ? (
              <ExecutiveChart points={cockpit.charts.ads_7d} unit="₹" height={48} />
            ) : (
              <div>
                <div style={{ fontSize: 14, fontWeight: 650, color: colors.textMuted, marginTop: 1 }}>Unavailable</div>
                <div style={s.muted}>{cockpit.charts.meta_unavailable || 'No verified marketing_performance rows for this period.'}</div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : '1fr 1.15fr 1fr',
            gap: compact ? 12 : 16,
            marginTop: 8,
            paddingBottom: 4,
          }}
        >
          <section>
            <div style={s.sectionLabel}>What changed</div>
            {cockpit.changes.length ? (
              cockpit.changes.map((c) => (
                <div key={c.id} style={{ padding: '3px 0', borderBottom: `1px solid ${colors.divider}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                    <span style={{ fontWeight: 650 }}>
                      <span style={{ color: toneColor(c.tone), marginRight: 6 }}>●</span>
                      {c.title}
                    </span>
                    <span style={{ color: colors.textMuted, fontSize: 10, letterSpacing: '0.06em' }}>{c.source}</span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>{c.why}</div>
                  {c.impact ? <div style={{ ...s.muted, marginTop: 0, fontSize: 11 }}>{c.impact}</div> : null}
                </div>
              ))
            ) : (
              <div style={s.muted}>No material changes.</div>
            )}
          </section>

          <section>
            <div style={s.sectionLabel}>Jarvis insight</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: colors.textSecondary }}>
              {cockpit.insight.text || 'No insight available.'}
            </p>
            <div style={{ ...s.muted, marginTop: 4, fontSize: 11 }}>{cockpit.insight.evidence_line}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button
                type="button"
                style={{ ...s.ghostBtn, border: 'none', padding: 0, color: s.accent, fontSize: 12 }}
                onClick={() =>
                  void jarvis.sendMessage(
                    cockpit.insight.text.includes('Meta')
                      ? 'Investigate why Meta data is missing.'
                      : 'Investigate what happened in the business today.'
                  )
                }
              >
                Investigate
              </button>
              <button
                type="button"
                style={{ ...s.ghostBtn, border: 'none', padding: 0, fontSize: 12 }}
                onClick={() => setEvidenceOpen((v) => !v)}
              >
                {evidenceOpen ? 'Hide evidence' : 'Show evidence'}
              </button>
            </div>
            {evidenceOpen ? (
              <div style={{ marginTop: 4 }}>
                {cockpit.insight.sources.map((src) => (
                  <div key={src.label} style={{ ...s.muted, marginTop: 2, fontSize: 11 }}>
                    {src.label} · {src.detail}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section>
            <div style={s.sectionLabel}>Needs your attention</div>
            {cockpit.attention.length ? (
              cockpit.attention.map((item) => (
                <div key={item.id} style={{ padding: '3px 0', borderBottom: `1px solid ${colors.divider}` }}>
                  <div style={{ fontSize: 12, fontWeight: 650 }}>{item.title}</div>
                  {item.detail ? <div style={{ ...s.muted, fontSize: 11 }}>{item.detail}</div> : null}
                  {actionLabel(item) ? (
                    <button
                      type="button"
                      onClick={() => goAttention(item)}
                      style={{ ...s.ghostBtn, border: 'none', padding: 0, marginTop: 2, color: s.accent, fontSize: 12 }}
                    >
                      {actionLabel(item)}
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <div style={s.muted}>Nothing requires your attention.</div>
            )}
          </section>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
            gap: compact ? 12 : 16,
            marginTop: 8,
            paddingTop: 6,
            borderTop: `1px solid ${colors.divider}`,
          }}
        >
          <section>
            <div style={s.sectionLabel}>Jarvis is working on</div>
            {cockpit.operator_timeline.length ? (
              cockpit.operator_timeline.map((event) => (
                <div key={event.id} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
                  <span style={{ color: stateColor(event.state), marginTop: 2 }}>●</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 650 }}>{event.state}</div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>{event.title}</div>
                    <div style={s.muted}>
                      {event.at ? formatTime(event.at) : event.detail}
                      {event.at && event.detail ? ` · ${event.detail}` : ''}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={s.muted}>No operator activity yet.</div>
            )}
          </section>

          <section>
            <div style={s.sectionLabel}>Jarvis recommends</div>
            {cockpit.recommendations.length ? (
              cockpit.recommendations.map((r) => (
                <div key={r.id} style={{ padding: '2px 0 6px' }}>
                  <div style={{ fontSize: 13, fontWeight: 650 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }}>Why · {r.problem}</div>
                  <div style={s.muted}>Evidence · {r.evidence}</div>
                  <div style={s.muted}>Risk · {r.risk}</div>
                  <button
                    type="button"
                    style={{ ...s.ghostBtn, border: 'none', padding: 0, marginTop: 4, color: s.accent }}
                    onClick={() =>
                      void jarvis.sendMessage(
                        r.action_type === 'Investigate'
                          ? 'Investigate why Meta data is missing.'
                          : `Review this recommendation: ${r.title}. Evidence: ${r.evidence}`
                      )
                    }
                  >
                    {r.action_type}
                  </button>
                </div>
              ))
            ) : (
              <div style={s.muted}>Jarvis has no action recommendation right now.</div>
            )}
          </section>
        </div>
      </div>

      <div style={s.composerDock}>
        <CommandBar
          value={jarvis.input}
          onChange={jarvis.setInput}
          onSubmit={(text) => void jarvis.sendMessage(text)}
          busy={jarvis.busy}
          placeholder="Ask Jarvis…"
        />
      </div>
    </div>
  )
}
