'use client'

import { formatUsd } from '@/lib/jarvis/operator-present'
import { j2, glassPanel } from './styles'

export function JarvisCostStatus({
  spentUsd,
  limitUsd,
  paused,
}: {
  spentUsd?: number | null
  limitUsd?: number | null
  paused?: boolean
}) {
  const spent = spentUsd ?? null
  const limit = limitUsd ?? null
  const remaining =
    spent != null && limit != null && Number.isFinite(spent) && Number.isFinite(limit)
      ? Math.max(0, limit - spent)
      : null

  return (
    <div style={{ ...glassPanel, padding: '10px 12px' }} aria-label="AI cost status">
      {paused ? (
        <>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'rgba(248,113,113,0.95)', fontWeight: 700 }}>
            JARVIS PAUSED
          </div>
          <div style={{ fontSize: 12, color: j2.muted, marginTop: 4 }}>Daily AI budget reached.</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: j2.muted, fontWeight: 650 }}>
            AI usage
          </div>
          <div style={{ fontSize: 13, marginTop: 4, color: j2.text }}>
            {formatUsd(spent)} today
            {remaining != null ? (
              <span style={{ color: j2.muted }}> · {formatUsd(remaining)} remaining</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
