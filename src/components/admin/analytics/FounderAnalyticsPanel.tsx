'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { AdminStatCard } from '@/components/admin/AdminStatCard'
import { BarChartCard, LineChartCard } from '@/components/admin/analytics/AnalyticsCharts'
import { adminStyles as s } from '@/lib/admin/styles'
import { colors } from '@/lib/design-tokens'
import { formatInr, formatUsd } from '@/lib/admin/pricing'
import type { BusinessAnalytics } from '@/lib/admin/business-analytics'

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}

export function FounderAnalyticsPanel() {
  const [data, setData] = useState<BusinessAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/business-analytics')
        if (!res.ok) throw new Error('Failed to load analytics')
        setData((await res.json()) as BusinessAnalytics)
      } catch {
        setError('Business analytics unavailable.')
      }
      setLoading(false)
    }
    void load()
  }, [])

  if (loading) {
    return <div style={{ ...s.card, color: colors.textMuted }}>Loading business analytics…</div>
  }

  if (error || !data) {
    return <div style={s.error}>{error || 'Analytics unavailable.'}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ ...s.cardTitle, fontSize: 22, marginBottom: 4 }}>Business Analytics</h2>
        <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14 }}>Revenue, customers, plans, and support at a glance.</p>
      </div>

      <div>
        <h3 style={sectionTitle}>Revenue</h3>
        <div style={s.statGrid}>
          <AdminStatCard label="Today" value={formatInr(data.revenue.todayInr)} accent={colors.accent} />
          <AdminStatCard label="Yesterday" value={formatInr(data.revenue.yesterdayInr)} />
          <AdminStatCard label="This Week" value={formatInr(data.revenue.weekInr)} />
          <AdminStatCard label="This Month" value={formatInr(data.revenue.monthInr)} accent={colors.accent} />
          <AdminStatCard label="Lifetime" value={formatInr(data.revenue.lifetimeInr)} accent={colors.textPrimary} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={s.card}>
          <h3 style={sectionTitle}>Customers</h3>
          <MetricRow label="Total Customers" value={String(data.customers.totalCustomers)} />
          <MetricRow label="Active Customers" value={String(data.customers.activeCustomers)} />
          <MetricRow label="New Today" value={String(data.customers.newToday)} />
          <MetricRow label="New This Month" value={String(data.customers.newThisMonth)} />
        </div>
        <div style={s.card}>
          <h3 style={sectionTitle}>Plans</h3>
          <MetricRow label="Total Generated" value={String(data.plans.totalGenerated)} />
          <MetricRow label="Active Plans" value={String(data.plans.activePlans)} />
          <MetricRow label="Draft Plans" value={String(data.plans.draftPlans)} />
        </div>
        <div style={s.card}>
          <h3 style={sectionTitle}>Support</h3>
          <MetricRow label="Open Requests" value={String(data.support.open)} />
          <MetricRow label="Claimed" value={String(data.support.claimed)} />
          <MetricRow label="Closed" value={String(data.support.closed)} />
          <Link href="/admin/support" style={{ ...s.linkBtn, display: 'inline-block', marginTop: 12 }}>
            View support queue →
          </Link>
        </div>
      </div>

      <div>
        <h3 style={sectionTitle}>AI Cost Analytics</h3>
        <div style={s.statGrid}>
          <AdminStatCard label="Today" value={formatUsd(data.aiCosts.todayUsd)} accent={colors.warning} />
          <AdminStatCard label="This Week" value={formatUsd(data.aiCosts.weekUsd)} />
          <AdminStatCard label="This Month" value={formatUsd(data.aiCosts.monthUsd)} />
          <AdminStatCard label="Lifetime" value={formatUsd(data.aiCosts.lifetimeUsd)} />
          <AdminStatCard
            label="Est. Monthly Spend"
            value={formatUsd(data.aiCosts.estimatedMonthlySpendUsd)}
            hint="Projected from current month"
          />
        </div>
        <div style={{ ...s.card, marginTop: 16 }}>
          <div style={s.infoGrid}>
            <MetricRow label="Avg / Generation" value={data.aiCosts.avgPerGenerationUsd != null ? formatUsd(data.aiCosts.avgPerGenerationUsd) : '—'} />
            <MetricRow label="Avg / Client" value={data.aiCosts.avgPerClientUsd != null ? formatUsd(data.aiCosts.avgPerClientUsd) : '—'} />
            <MetricRow label="Avg / Plan" value={data.aiCosts.avgPerPlanUsd != null ? formatUsd(data.aiCosts.avgPerPlanUsd) : '—'} />
            <MetricRow label="Avg Tokens" value={data.aiCosts.avgTokensPerGeneration != null ? String(data.aiCosts.avgTokensPerGeneration) : '—'} />
            <MetricRow label="Most Expensive" value={data.aiCosts.mostExpensiveUsd != null ? formatUsd(data.aiCosts.mostExpensiveUsd) : '—'} />
            <MetricRow label="Cheapest" value={data.aiCosts.cheapestUsd != null ? formatUsd(data.aiCosts.cheapestUsd) : '—'} />
            <MetricRow label="Success Rate" value={data.aiCosts.successRate != null ? `${data.aiCosts.successRate}%` : '—'} />
            <MetricRow label="Validation Failures" value={data.aiCosts.validationFailureRate != null ? `${data.aiCosts.validationFailureRate}%` : '—'} />
            <MetricRow label="Retry Rate" value={data.aiCosts.retryRate != null ? `${data.aiCosts.retryRate}%` : '—'} />
          </div>
        </div>
      </div>

      <div style={s.card}>
        <h3 style={sectionTitle}>Profit Dashboard</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <ProfitStep label="Revenue" value={formatInr(data.profit.revenueInr)} />
          <ProfitStep label="Razorpay Fees" value={formatInr(data.profit.razorpayFeesInr)} />
          <ProfitStep label="AI Cost" value={formatInr(data.profit.aiCostInr)} />
          <ProfitStep label="Net Revenue" value={formatInr(data.profit.netRevenueInr)} />
          <ProfitStep label="Gross Profit" value={formatInr(data.profit.grossProfitInr)} highlight />
        </div>
        <div style={s.infoGrid}>
          <MetricRow label="Gross Margin" value={data.profit.grossMarginPercent != null ? `${data.profit.grossMarginPercent}%` : '—'} />
          <MetricRow label="AI Cost %" value={data.profit.aiCostPercent != null ? `${data.profit.aiCostPercent}%` : '—'} />
          <MetricRow label="Payment Fee %" value={data.profit.paymentFeePercent != null ? `${data.profit.paymentFeePercent}%` : '—'} />
          <MetricRow label="Avg Profit / Client" value={data.profit.avgProfitPerClientInr != null ? formatInr(data.profit.avgProfitPerClientInr) : '—'} />
        </div>
      </div>

      <div style={s.card}>
        <h3 style={sectionTitle}>Platform Health</h3>
        <div style={s.infoGrid}>
          <MetricRow label="Anthropic Status" value={data.platform.anthropicStatus === 'configured' ? 'Configured' : 'Not configured'} />
          <MetricRow label="Current Model" value={data.platform.currentModel} />
          <MetricRow
            label="Last Successful Generation"
            value={data.platform.lastSuccessfulGeneration ? new Date(data.platform.lastSuccessfulGeneration).toLocaleString() : '—'}
          />
          <MetricRow
            label="Average Generation Time"
            value={data.platform.averageGenerationTimeMs != null ? `${data.platform.averageGenerationTimeMs} ms` : '—'}
          />
          <MetricRow
            label="Generation Success"
            value={data.platform.generationSuccessRate != null ? `${data.platform.generationSuccessRate}%` : '—'}
          />
          <MetricRow
            label="JSON Validation"
            value={data.platform.jsonValidationSuccessRate != null ? `${data.platform.jsonValidationSuccessRate}%` : '—'}
          />
          <MetricRow label="Database" value={data.platform.databaseStatus} />
          <MetricRow label="Storage" value={data.platform.storageStatus} />
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={sectionTitle}>Charts</h3>
          <ExportButtons />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <LineChartCard title="Revenue by Day" points={data.charts.revenueByDay} valuePrefix="₹" />
          <LineChartCard title="Revenue by Month" points={data.charts.revenueByMonth} valuePrefix="₹" />
          <LineChartCard title="AI Cost by Day" points={data.charts.aiCostByDay} valuePrefix="$" />
          <BarChartCard title="AI Cost by Model" points={data.charts.aiCostByModel} valuePrefix="$" />
          <LineChartCard title="Customer Growth" points={data.charts.customerGrowth} />
          <LineChartCard title="Purchases per Day" points={data.charts.purchasesPerDay} />
          <LineChartCard title="Plans Generated per Day" points={data.charts.plansPerDay} />
          <LineChartCard title="Support Requests per Day" points={data.charts.supportPerDay} />
        </div>
      </div>

      <Link href="/admin/purchases" style={s.linkBtn}>View all purchases →</Link>
    </div>
  )
}

function ProfitStep({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        backgroundColor: highlight ? colors.accentMuted : colors.bgElevated,
        border: highlight ? `1px solid ${colors.accent}` : `1px solid ${colors.borderSubtle}`,
      }}
    >
      <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: colors.textPrimary, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function ExportButtons() {
  const types = [
    { type: 'purchases', label: 'Purchases' },
    { type: 'revenue', label: 'Revenue' },
    { type: 'ai-costs', label: 'AI Costs' },
    { type: 'customers', label: 'Customers' },
  ] as const

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {types.map((item) => (
        <span key={item.type} style={{ display: 'flex', gap: 4 }}>
          <a href={`/api/admin/exports?type=${item.type}&format=csv`} style={exportBtnStyle}>
            {item.label} CSV
          </a>
          <a href={`/api/admin/exports?type=${item.type}&format=xlsx`} style={exportBtnStyle}>
            Excel
          </a>
        </span>
      ))}
    </div>
  )
}

const sectionTitle: CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: 16,
  fontWeight: 600,
  color: colors.textPrimary,
}

const exportBtnStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  backgroundColor: colors.bgElevated,
  color: colors.textPrimary,
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 600,
  border: `1px solid ${colors.borderSubtle}`,
}
