'use client'

import { useEffect, useState } from 'react'
import { AdminStatCard } from '@/components/admin/AdminStatCard'
import { adminStyles as s } from '@/lib/admin/styles'
import { colors } from '@/lib/design-tokens'
import type { CacheAnalyticsSnapshot } from '@/lib/ai/prompt-cache/types'

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}

export function PromptCacheAnalyticsPanel() {
  const [data, setData] = useState<CacheAnalyticsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/prompt-cache-analytics')
        if (!res.ok) throw new Error('Failed to load')
        setData((await res.json()) as CacheAnalyticsSnapshot)
      } catch {
        setError('Prompt cache analytics unavailable.')
      }
      setLoading(false)
    }
    void load()
  }, [])

  if (loading) {
    return <div style={{ ...s.card, color: colors.textMuted }}>Loading prompt cache analytics…</div>
  }

  if (error || !data) {
    return <div style={s.error}>{error || 'Analytics unavailable.'}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ ...s.cardTitle, fontSize: 22, marginBottom: 4 }}>AI Prompt Cache</h2>
        <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14 }}>
          Dependency-based block caching — hits, compile time, and estimated Claude savings.
        </p>
      </div>

      <div style={s.statGrid}>
        <AdminStatCard label="Cache Hits" value={data.totalHits} accent="#28a745" />
        <AdminStatCard label="Cache Misses" value={data.totalMisses} accent="#dc3545" />
        <AdminStatCard
          label="Hit Ratio"
          value={`${data.hitRatio}%`}
          hint={`${data.recentCompiles} compiles`}
          accent={colors.accent}
        />
        <AdminStatCard
          label="Est. Tokens Saved"
          value={data.estimatedTokensSaved.toLocaleString()}
          hint={`~$${data.estimatedCostSavedUsd.toFixed(4)} USD`}
          accent="#0d9488"
        />
      </div>

      <div style={s.card}>
        <h3 style={s.cardTitle}>Compile Performance</h3>
        <MetricRow label="Average compile time" value={`${data.averageCompileTimeMs} ms`} />
        <MetricRow label="Average prompt size" value={`~${data.averagePromptTokens.toLocaleString()} tokens`} />
        <MetricRow label="Last updated" value={new Date(data.lastUpdated).toLocaleString()} />
      </div>
    </div>
  )
}
