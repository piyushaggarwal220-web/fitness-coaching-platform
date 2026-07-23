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
    return <div style={{ ...s.card, color: colors.textMuted }}>Loading financial analytics…</div>
  }

  if (error || !data) {
    return <div style={s.error}>{error || 'Analytics unavailable.'}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ ...s.cardTitle, fontSize: 22, marginBottom: 4 }}>Financial analysis</h2>
        <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14 }}>
          Real Razorpay captured revenue, refunds, estimated fees, and AI spend. Enrollment codes are
          tracked separately (₹0, not revenue).
        </p>
      </div>

      <div>
        <h3 style={sectionTitle}>Revenue (captured)</h3>
        <div style={s.statGrid}>
          <AdminStatCard label="Today" value={formatInr(data.revenue.todayInr)} accent={colors.accent} />
          <AdminStatCard label="Yesterday" value={formatInr(data.revenue.yesterdayInr)} />
          <AdminStatCard label="This Week" value={formatInr(data.revenue.weekInr)} />
          <AdminStatCard label="This Month" value={formatInr(data.revenue.monthInr)} accent={colors.accent} />
          <AdminStatCard label="Lifetime gross" value={formatInr(data.revenue.lifetimeInr)} accent={colors.textPrimary} />
        </div>
      </div>

      <div style={s.card}>
        <h3 style={sectionTitle}>P&amp;L snapshot</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          <ProfitStep label="Gross sales" value={formatInr(data.profit.revenueInr)} />
          <ProfitStep label="Refunds" value={formatInr(data.profit.refundsInr)} />
          <ProfitStep label="Net sales" value={formatInr(data.profit.netSalesInr)} />
          <ProfitStep label="Razorpay fees (est.)" value={formatInr(data.profit.razorpayFeesInr)} />
          <ProfitStep label="After fees" value={formatInr(data.profit.netRevenueInr)} />
          <ProfitStep label="AI cost" value={formatInr(data.profit.aiCostInr)} />
          <ProfitStep label="Operating profit" value={formatInr(data.profit.operatingProfitInr)} highlight />
        </div>
        <div style={s.infoGrid}>
          <MetricRow label="Margin on net sales" value={data.profit.grossMarginPercent != null ? `${data.profit.grossMarginPercent}%` : '—'} />
          <MetricRow label="AI cost %" value={data.profit.aiCostPercent != null ? `${data.profit.aiCostPercent}%` : '—'} />
          <MetricRow label="Fee %" value={data.profit.paymentFeePercent != null ? `${data.profit.paymentFeePercent}%` : '—'} />
          <MetricRow label="Avg profit / client" value={data.profit.avgProfitPerClientInr != null ? formatInr(data.profit.avgProfitPerClientInr) : '—'} />
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: colors.textMuted }}>{data.profit.notes}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={s.card}>
          <h3 style={sectionTitle}>Customers</h3>
          <MetricRow label="Total clients" value={String(data.customers.totalCustomers)} />
          <MetricRow label="Active plans" value={String(data.customers.activeCustomers)} />
          <MetricRow label="Paid (Razorpay)" value={String(data.enrollment.paidClients)} />
          <MetricRow label="Enrollment codes" value={String(data.enrollment.enrollmentClients)} />
          <MetricRow label="Trials" value={String(data.enrollment.trialClients)} />
          <MetricRow label="Pending onboarding" value={String(data.enrollment.pendingOnboarding)} />
          <MetricRow label="Seats expiring ≤30d" value={String(data.enrollment.seatsExpiringIn30Days)} />
        </div>
        <div style={s.card}>
          <h3 style={sectionTitle}>Enrollment codes</h3>
          <MetricRow label="Codes issued" value={String(data.enrollment.codesIssued)} />
          <MetricRow label="Active with uses left" value={String(data.enrollment.codesActive)} />
          <MetricRow label="Redeemed" value={String(data.enrollment.codesRedeemed)} />
          <MetricRow label="Uses remaining" value={String(data.enrollment.usesRemaining)} />
          <Link href="/admin/redemption-codes" style={{ ...s.linkBtn, display: 'inline-block', marginTop: 12 }}>
            Manage enrollment codes →
          </Link>
        </div>
        <div style={s.card}>
          <h3 style={sectionTitle}>Operations</h3>
          <MetricRow label="Plans generated" value={String(data.plans.totalGenerated)} />
          <MetricRow label="Active plans" value={String(data.plans.activePlans)} />
          <MetricRow label="Draft plans" value={String(data.plans.draftPlans)} />
          <MetricRow label="Support open" value={String(data.support.open)} />
          <MetricRow label="Support claimed" value={String(data.support.claimed)} />
          <Link href="/admin/support" style={{ ...s.linkBtn, display: 'inline-block', marginTop: 12 }}>
            View support queue →
          </Link>
        </div>
      </div>

      <div>
        <h3 style={sectionTitle}>AI costs</h3>
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
          <LineChartCard title="Paid purchases / day" points={data.charts.purchasesPerDay} />
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
