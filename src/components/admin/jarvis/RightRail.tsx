'use client'

import { colors } from '@/lib/design-tokens'
import { relativeTime, taskStatusLabel } from '@/lib/jarvis/operator-present'
import type { IntegrationStatus, PulseMetricCell, SystemHealth } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { ApprovalCardView } from './ApprovalsView'
import * as s from './styles'

function Metric({ label, metric }: { label: string; metric?: PulseMetricCell }) {
  const tone =
    metric?.status === 'ok' ? colors.textPrimary : metric?.status === 'error' ? colors.danger : colors.textMuted
  return (
    <div>
      <div style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: tone }}>{metric?.display ?? 'Not connected'}</div>
      <div style={{ ...s.muted, marginTop: 2 }}>{metric?.hint}</div>
    </div>
  )
}

function PulseList({ title, items, empty }: { title: string; items?: string[]; empty: string }) {
  return (
    <div>
      <div style={{ ...s.eyebrow, marginBottom: 8 }}>{title}</div>
      {items?.length ? (
        items.map((item) => (
          <div key={item} style={{ ...s.card, marginBottom: 8, fontSize: 13 }}>
            {item}
          </div>
        ))
      ) : (
        <div style={s.muted}>{empty}</div>
      )}
    </div>
  )
}

function healthBadge(level?: SystemHealth['level']) {
  if (level === 'operational') return { emoji: '🟢', tone: 'ok' as const, label: 'Operational' }
  if (level === 'action_required') return { emoji: '🔴', tone: 'danger' as const, label: 'Action required' }
  return { emoji: '🟡', tone: 'warn' as const, label: 'Operational' }
}

function statusEmoji(status: IntegrationStatus) {
  if (status === 'connected') return '🟢'
  if (status === 'error') return '🔴'
  if (status === 'partial') return '🟡'
  if (status === 'disabled') return '⚪'
  return '⚪'
}

export function RightRail({ jarvis }: { jarvis: JarvisCommandState }) {
  const pulse = jarvis.dashboard?.pulse
  const today = pulse?.today
  const task = jarvis.activeTask
  const approvals = jarvis.pendingApprovals.slice(0, 2)
  const activity = (jarvis.dashboard?.activity ?? []).slice(0, 5)
  const health = jarvis.dashboard?.health
  const badge = healthBadge(health?.level)
  const integrations = (jarvis.dashboard?.integrations ?? []).slice(0, 7)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '16px 16px 10px', borderBottom: `1px solid ${colors.divider}` }}>
        <div style={s.eyebrow}>LIVE OPS</div>
        <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4 }}>Today</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={s.card}>
          <div style={s.eyebrow}>JARVIS SYSTEM</div>
          <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>
            {badge.emoji} {badge.label}
          </div>
          <div style={s.muted}>{health?.explanation || 'Checking connected systems…'}</div>
          <span style={{ ...s.badge(badge.tone), marginTop: 8 }}>{badge.label}</span>
        </div>

        {task ? (
          <div style={s.card}>
            <div style={s.eyebrow}>CURRENT TASK</div>
            <div style={{ fontWeight: 700, marginTop: 6, fontSize: 13 }}>{'objective' in task ? task.objective : ''}</div>
            <div style={s.muted}>{taskStatusLabel(task.status)}</div>
          </div>
        ) : null}

        <div style={s.card}>
          <div style={s.eyebrow}>BUSINESS PULSE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            <Metric label="Revenue" metric={today?.revenue} />
            <Metric label="Paid sales" metric={today?.orders} />
            <Metric label="Ad spend" metric={today?.ad_spend} />
            <Metric label="Purchases" metric={today?.purchases} />
            <Metric label="CPA" metric={today?.cpa} />
            <Metric label="ROAS" metric={today?.roas} />
          </div>
          {pulse?.shopify?.connected ? (
            <div style={s.muted}>
              Shopify store {pulse.shopify.orders != null ? `${pulse.shopify.orders} orders` : 'orders n/a'}
              {pulse.shopify.revenue != null ? ` · ₹${Math.round(pulse.shopify.revenue).toLocaleString('en-IN')}` : ''}
              {pulse.shopify.aov != null ? ` · AOV ₹${Math.round(pulse.shopify.aov).toLocaleString('en-IN')}` : ''}
              {pulse.shopify.refunds_amount
                ? ` · Refunds ₹${Math.round(pulse.shopify.refunds_amount).toLocaleString('en-IN')}`
                : ''}
            </div>
          ) : (
            <div style={s.muted}>{pulse?.shopify?.unavailable_reason || 'Shopify store not connected.'}</div>
          )}
          <div style={s.muted}>{pulse?.note}</div>
        </div>

        {(pulse?.funnel_health ?? []).map((f) => (
          <div key={String(f.funnel_id)} style={s.card}>
            <div style={s.eyebrow}>FUNNEL</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>
              {f.funnel_name}
              {f.price_inr != null ? ` · ₹${f.price_inr.toLocaleString('en-IN')}` : ''}
            </div>
            {f.available ? (
              <div style={{ ...s.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>Spend {f.spend.display}</span>
                <span>Purchases {f.purchases.display}</span>
                <span>CPA {f.cpa.display}</span>
                <span>ROAS {f.roas.display}</span>
              </div>
            ) : (
              <div style={s.muted}>
                {f.spend.status === 'not_connected'
                  ? 'Not connected — Meta Ads required for this funnel’s ads.'
                  : `${f.funnel_name} has no Meta spend today. Kept separate from the other offer.`}
              </div>
            )}
          </div>
        ))}

        <div style={s.card}>
          <div style={s.eyebrow}>INTEGRATIONS</div>
          {integrations.length ? (
            integrations.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 13 }}>
                <span>
                  {statusEmoji(item.status)} {item.name}
                </span>
                <span style={{ color: colors.textMuted, textTransform: 'capitalize' }}>
                  {item.status.replace('_', ' ')}
                </span>
              </div>
            ))
          ) : (
            <div style={s.muted}>Open Integrations to see connection status.</div>
          )}
        </div>

        {approvals.length ? (
          <div>
            <div style={{ ...s.eyebrow, marginBottom: 8 }}>WAITING</div>
            {approvals.map((a) => (
              <ApprovalCardView key={a.id} approval={a} busy={jarvis.busy} onDecide={jarvis.decide} compact />
            ))}
          </div>
        ) : (
          <div style={s.muted}>No pending approvals.</div>
        )}

        <PulseList title="ATTENTION" items={pulse?.attention} empty="No alerts from connected sources." />
        <PulseList title="OPPORTUNITIES" items={pulse?.opportunities} empty="No opportunities recorded yet." />
        <PulseList title="WINS" items={pulse?.wins} empty="No wins recorded yet." />

        <div>
          <div style={{ ...s.eyebrow, marginBottom: 8 }}>RESEARCH</div>
          {(pulse?.research ?? []).length ? (
            (pulse?.research ?? []).map((r) => (
              <div key={r.id} style={{ ...s.card, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.title}</div>
                <div style={s.muted}>{r.finding || pulse?.research_unavailable || 'No stored findings yet.'}</div>
              </div>
            ))
          ) : (
            <div style={s.muted}>{pulse?.research_unavailable || 'No stored research findings yet.'}</div>
          )}
        </div>

        <div>
          <div style={{ ...s.eyebrow, marginBottom: 8 }}>RECENT ACTIVITY</div>
          {activity.length ? (
            activity.map((item) => (
              <div key={item.id} style={{ ...s.card, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: colors.textMuted }}>
                  {relativeTime(item.at)} · {item.kind}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{item.title}</div>
              </div>
            ))
          ) : (
            <div style={s.muted}>No activity yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
