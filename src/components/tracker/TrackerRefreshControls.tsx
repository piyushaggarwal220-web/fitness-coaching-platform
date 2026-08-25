'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { colors, radius } from '@/lib/design-tokens'

/**
 * Single recovery control for the tracker.
 * Refresh force-rebuilds today's snapshot from the active plan and remounts
 * the workout UI so sets, timer, and folders start from that snapshot.
 */
export function TrackerRefreshControls({ align = 'right' }: { align?: 'left' | 'right' }) {
  const { loading, rebuilding, rebuildFromPlan } = useTracker()
  const [note, setNote] = useState<string | null>(null)

  const busy = rebuilding || loading

  const handleRefresh = async () => {
    setNote(null)
    const ok = await rebuildFromPlan()
    setNote(ok ? 'Tracker rebooted from your latest plan.' : null)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 4,
      }}
    >
      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={busy}
        aria-label="Refresh tracker from plan"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: radius.sm,
          border: `1px solid ${colors.borderSubtle}`,
          background: colors.bgElevated,
          color: colors.textSecondary,
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <RefreshCw
          size={15}
          style={{ animation: rebuilding ? 'trk-spin 0.8s linear infinite' : undefined }}
          aria-hidden
        />
        {rebuilding ? 'Refreshing…' : 'Refresh'}
      </button>
      {note && <span style={{ fontSize: 12, color: colors.accent }}>{note}</span>}
      <style>{`@keyframes trk-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
