'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { AdminStatCard } from '@/components/admin/AdminStatCard'
import { BarChartCard, LineChartCard } from '@/components/admin/analytics/AnalyticsCharts'
import { adminStyles as s } from '@/lib/admin/styles'
import { colors } from '@/lib/design-tokens'
import type { ComplexityAnalytics, ComplexityAnalyticsPeriod } from '@/lib/complexity/analytics'
import { formatTierLabel } from '@/lib/complexity/display'

const PERIOD_LABELS: Record<ComplexityAnalyticsPeriod, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  lifetime: 'Lifetime',
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}

export function ComplexityAnalyticsPanel() {
  const [data, setData] = useState<ComplexityAnalytics | null>(null)
  const [period, setPeriod] = useState<ComplexityAnalyticsPeriod>('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/complexity-analytics')
        if (!res.ok) throw new Error('Failed to load')
        setData((await res.json()) as ComplexityAnalytics)
      } catch {
        setError('Complexity analytics unavailable.')
      }
      setLoading(false)
    }
    void load()
  }, [])

  if (loading) {
    return <div style={{ ...s.card, color: colors.textMuted }}>Loading complexity analytics…</div>
  }

  if (error || !data) {
    return <div style={s.error}>{error || 'Analytics unavailable.'}</div>
  }

  const { distribution } = data
  const movements = data.movements[period]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ ...s.cardTitle, fontSize: 22, marginBottom: 4 }}>Complexity Analytics</h2>
        <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14 }}>
          Client coaching complexity distribution, trends, and tier movement.
        </p>
      </div>

      <div style={s.statGrid}>
        <AdminStatCard
          label="Low Complexity"
          value={`${distribution.low.count}`}
          hint={`${distribution.low.percent}%`}
          accent="#28a745"
        />
        <AdminStatCard
          label="Medium Complexity"
          value={`${distribution.medium.count}`}
          hint={`${distribution.medium.percent}%`}
          accent="#ffc107"
        />
        <AdminStatCard
          label="High Complexity"
          value={`${distribution.high.count}`}
          hint={`${distribution.high.percent}%`}
          accent="#dc3545"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={s.card}>
          <h3 style={sectionTitle}>Improvement Metrics</h3>
          <MetricRow label="Average Complexity Score" value={data.averageScore != null ? String(data.averageScore) : '—'} />
          <MetricRow label="Average Improvement" value={data.averageImprovement != null ? String(data.averageImprovement) : '—'} />
          <MetricRow label="Average Score Reduction" value={data.averageScoreReduction != null ? String(data.averageScoreReduction) : '—'} />
          <MetricRow label="Average Score Increase" value={data.averageScoreIncrease != null ? String(data.averageScoreIncrease) : '—'} />
          <MetricRow
            label="Most Improved Client"
            value={
              data.mostImprovedClient
                ? `${data.mostImprovedClient.name ?? 'Client'} (${data.mostImprovedClient.change})`
                : '—'
            }
          />
          <MetricRow
            label="Most Complex Client"
            value={
              data.mostComplexClient
                ? `${data.mostComplexClient.name ?? 'Client'} — ${data.mostComplexClient.score} (${formatTierLabel(data.mostComplexClient.tier)})`
                : '—'
            }
          />
        </div>

        <div style={s.card}>
          <h3 style={sectionTitle}>Tier Movement</h3>
          <div style={periodTabs}>
            {(Object.keys(PERIOD_LABELS) as ComplexityAnalyticsPeriod[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                style={{
                  ...periodBtn,
                  backgroundColor: period === key ? colors.accent : colors.bgElevated,
                  color: period === key ? colors.textInverse : colors.textSecondary,
                }}
              >
                {PERIOD_LABELS[key]}
              </button>
            ))}
          </div>
          {movements.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: 14 }}>No tier movements in this period.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {movements.map((m) => (
                <div key={`${m.from}-${m.to}`} style={movementRow}>
                  <span style={{ fontWeight: 600 }}>
                    {formatTierLabel(m.from)} → {formatTierLabel(m.to)}
                  </span>
                  <span>{m.count} client{m.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <BarChartCard
          title="Current Distribution"
          points={data.distributionChart.map((p) => ({ date: p.tier, value: p.count }))}
        />
        <LineChartCard
          title="Average Complexity by Week"
          points={data.weeklyAverageTrend.map((p) => ({ date: p.week, value: p.averageScore }))}
        />
        <BarChartCard
          title="Tier Movement (30 days)"
          points={data.movementChart.map((p) => ({ date: p.label, value: p.count }))}
        />
      </div>

      {data.mostComplexClient && (
        <p style={{ margin: 0, fontSize: 13, color: colors.textSecondary }}>
          <Link href={`/admin/clients/${data.mostComplexClient.id}`} style={s.linkBtn}>
            View most complex client →
          </Link>
        </p>
      )}
    </div>
  )
}

const sectionTitle: CSSProperties = { margin: '0 0 12px 0', fontSize: 15, fontWeight: 600, color: colors.textPrimary }
const periodTabs: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const periodBtn: CSSProperties = {
  border: 'none',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 600,
}
const movementRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 14,
  padding: '8px 0',
  borderBottom: `1px solid ${colors.divider}`,
}
