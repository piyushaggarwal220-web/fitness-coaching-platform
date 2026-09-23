'use client'

/**
 * Compact approval card — action + decide first; long diagnostics behind View details.
 */

import { useState } from 'react'
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
  const [detailsOpen, setDetailsOpen] = useState(false)
  void compact

  return (
    <div style={{ ...glassPanel, padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '7px 12px',
          borderBottom: `1px solid ${j2.glassBorder}`,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(251, 191, 36, 0.95)',
          fontWeight: 700,
        }}
      >
        Approval required
      </div>
      <div style={{ padding: 4 }}>
        <ApprovalCardView
          approval={approval}
          busy={busy}
          onDecide={onDecide}
          onRevise={onRevise}
          compact={!detailsOpen}
        />
      </div>
      <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: 'none',
            color: j2.amber,
            fontSize: 11,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {detailsOpen ? 'Hide details' : 'View details'}
        </button>
        <div style={{ fontSize: 10, color: j2.muted, lineHeight: 1.4 }}>
          Live Meta / Instagram publishing stay off unless enabled in environment.
        </div>
      </div>
    </div>
  )
}
