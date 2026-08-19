'use client'

import { useState } from 'react'
import { RefreshCw, RotateCcw } from 'lucide-react'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { colors, radius, spacing } from '@/lib/design-tokens'

/**
 * Client recovery controls for the tracker:
 * - Refresh: re-fetch today's tracker (fixes stale/failed loads).
 * - Rebuild from plan: force a fresh snapshot from the active plan (fixes "wrong workout showing"
 *   when automatic change detection missed a plan edit). Logged progress is preserved server-side.
 */
export function TrackerRefreshControls({ align = 'right' }: { align?: 'left' | 'right' }) {
  const { loading, rebuilding, refresh, rebuildFromPlan } = useTracker()
  const [refreshing, setRefreshing] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const busy = refreshing || rebuilding || loading

  const handleRefresh = async () => {
    setNote(null)
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  const handleRebuild = async () => {
    setNote(null)
    const ok = await rebuildFromPlan()
    setNote(ok ? 'Synced with your latest plan.' : null)
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
      <div style={{ display: 'flex', gap: spacing[2] }}>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={busy}
          aria-label="Refresh tracker"
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
            style={{ animation: refreshing ? 'trk-spin 0.8s linear infinite' : undefined }}
            aria-hidden
          />
          Refresh
        </button>
        <button
          type="button"
          onClick={handleRebuild}
          disabled={busy}
          aria-label="Rebuild tracker from plan"
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
          <RotateCcw
            size={15}
            style={{ animation: rebuilding ? 'trk-spin 0.8s linear infinite' : undefined }}
            aria-hidden
          />
          {rebuilding ? 'Rebuilding…' : 'Rebuild from plan'}
        </button>
      </div>
      {note && (
        <span style={{ fontSize: 12, color: colors.accent }}>{note}</span>
      )}
      <style>{`@keyframes trk-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
