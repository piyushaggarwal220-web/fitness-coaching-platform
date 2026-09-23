'use client'

import { colors } from '@/lib/design-tokens'
import {
  formatDateTime,
  publicStateEntries,
  toolFamily,
} from '@/lib/jarvis/operator-present'
import type { ApprovalCard } from './types'
import * as s from './styles'

function riskTone(level: string): 'ok' | 'warn' | 'danger' | 'info' {
  const l = level.toLowerCase()
  if (l === 'critical' || l === 'high' || l === 'dangerous') return 'danger'
  if (l === 'medium' || l === 'significant') return 'warn'
  return 'info'
}

export function ApprovalCardView({
  approval,
  busy,
  onDecide,
  onRevise,
  compact,
}: {
  approval: ApprovalCard
  busy: boolean
  onDecide: (id: string, approve: boolean) => void
  onRevise?: (label: string) => void
  compact?: boolean
}) {
  const current = publicStateEntries(approval.current_state)
  const proposed = publicStateEntries(approval.proposed_state)

  return (
    <div style={{ ...s.card, borderColor: 'rgba(245, 158, 11, 0.35)', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div>
          <div style={s.eyebrow}>ACTION</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{approval.action_label}</div>
        </div>
        <span style={s.badge(riskTone(approval.risk_level))}>RISK · {approval.risk_level}</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={s.eyebrow}>WHY</div>
        <p style={{ fontSize: 13, margin: '4px 0 0', color: colors.textSecondary }}>{approval.reason}</p>
      </div>
      <div style={{ ...s.muted, marginTop: 8 }}>
        <span style={{ letterSpacing: '0.06em', fontSize: 10, color: colors.textMuted }}>TARGET</span>
        {' · '}
        {toolFamily(approval.tool_name)}
        {approval.created_at ? ` · ${formatDateTime(approval.created_at)}` : ''}
      </div>
      {approval.expected_cost_note ? (
        <div style={{ ...s.muted, color: colors.warning }}>{approval.expected_cost_note}</div>
      ) : null}

      {!compact ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <div style={{ background: colors.bgSecondary, borderRadius: 8, padding: 8 }}>
            <div style={s.eyebrow}>CURRENT</div>
            {current.length ? (
              current.map((e) => (
                <div key={e.label} style={{ fontSize: 12, marginTop: 4 }}>
                  <span style={{ color: colors.textMuted }}>{e.label}: </span>
                  {e.value}
                </div>
              ))
            ) : (
              <div style={s.muted}>No data available</div>
            )}
          </div>
          <div style={{ background: colors.bgSecondary, borderRadius: 8, padding: 8 }}>
            <div style={s.eyebrow}>PROPOSED</div>
            {proposed.length ? (
              proposed.map((e) => (
                <div key={e.label} style={{ fontSize: 12, marginTop: 4 }}>
                  <span style={{ color: colors.textMuted }}>{e.label}: </span>
                  {e.value}
                </div>
              ))
            ) : (
              <div style={s.muted}>No data available</div>
            )}
          </div>
        </div>
      ) : null}

      {Array.isArray(approval.evidence) && approval.evidence.length && !compact ? (
        <ul style={{ fontSize: 12, color: colors.textSecondary, paddingLeft: 18, marginTop: 8 }}>
          {approval.evidence.slice(0, 4).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" style={s.solidBtn} disabled={busy} onClick={() => onDecide(approval.id, true)}>
          Approve
        </button>
        <button type="button" style={s.dangerBtn} disabled={busy} onClick={() => onDecide(approval.id, false)}>
          Reject
        </button>
        {onRevise ? (
          <button type="button" style={s.ghostBtn} disabled={busy} onClick={() => onRevise(approval.action_label)}>
            Modify
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function ApprovalsView({
  approvals,
  busy,
  onDecide,
  onRevise,
}: {
  approvals: ApprovalCard[]
  busy: boolean
  onDecide: (id: string, approve: boolean) => void
  onRevise?: (label: string) => void
}) {
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>Operations</div>
      <h2 style={{ margin: '6px 0 16px', fontSize: 22, letterSpacing: '-0.03em' }}>Waiting for you</h2>
      {approvals.length ? (
        approvals.map((a) => (
          <ApprovalCardView key={a.id} approval={a} busy={busy} onDecide={onDecide} onRevise={onRevise} />
        ))
      ) : (
        <div style={s.muted}>No pending approvals.</div>
      )}
    </div>
  )
}
