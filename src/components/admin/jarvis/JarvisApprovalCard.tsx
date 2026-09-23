'use client'

/**
 * Polished approval card for Jarvis 2.0 — reuses Phase 12 decide path.
 * Voice "yes" must never auto-approve; only explicit Approve on a specific card.
 */

import { ApprovalCardView } from './ApprovalsView'
import type { ApprovalCard } from './types'
import { j2, glassPanel } from './styles'

export function JarvisApprovalCard({
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
  return (
    <div style={{ ...glassPanel, padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '8px 14px',
          borderBottom: `1px solid ${j2.glassBorder}`,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(251, 191, 36, 0.95)',
          fontWeight: 700,
        }}
      >
        Approval center · explicit confirmation required
      </div>
      <div style={{ padding: 4 }}>
        <ApprovalCardView
          approval={approval}
          busy={busy}
          onDecide={onDecide}
          onRevise={onRevise}
          compact={compact}
        />
      </div>
      <div style={{ padding: '0 14px 12px', fontSize: 11, color: j2.muted }}>
        Approving runs through Phase 12 policy. Live Meta and Instagram publishing stay off unless separately enabled in
        environment configuration.
      </div>
    </div>
  )
}
