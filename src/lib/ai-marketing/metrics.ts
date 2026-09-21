/** Pure metric helpers — unit-tested. */

export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null
  }
  return numerator / denominator
}

export function calcCtr(clicks: number, impressions: number): number | null {
  const v = safeDivide(clicks, impressions)
  return v === null ? null : v * 100
}

export function calcCpc(spend: number, clicks: number): number | null {
  return safeDivide(spend, clicks)
}

export function calcCpm(spend: number, impressions: number): number | null {
  const v = safeDivide(spend, impressions)
  return v === null ? null : v * 1000
}

export function calcCpa(spend: number, purchases: number): number | null {
  return safeDivide(spend, purchases)
}

export function calcRoas(revenue: number, spend: number): number | null {
  return safeDivide(revenue, spend)
}

export function calcConversionRate(purchases: number, clicks: number): number | null {
  const v = safeDivide(purchases, clicks)
  return v === null ? null : v * 100
}

export function percentChange(current: number, proposed: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(proposed) || current === 0) return null
  return ((proposed - current) / current) * 100
}

export function applyBudgetChange(
  currentBudget: number,
  percentChangeValue: number
): number {
  return Math.max(0, Math.round(currentBudget * (1 + percentChangeValue / 100)))
}

export function aggregatePerformance(
  rows: {
    spend: number
    impressions: number
    reach: number
    clicks: number
    purchases: number
    revenue: number
  }[]
) {
  const totals = rows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend) || 0
      acc.impressions += Number(r.impressions) || 0
      acc.reach += Number(r.reach) || 0
      acc.clicks += Number(r.clicks) || 0
      acc.purchases += Number(r.purchases) || 0
      acc.revenue += Number(r.revenue) || 0
      return acc
    },
    { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, revenue: 0 }
  )

  return {
    ...totals,
    ctr: calcCtr(totals.clicks, totals.impressions),
    cpc: calcCpc(totals.spend, totals.clicks),
    cpm: calcCpm(totals.spend, totals.impressions),
    cpa: calcCpa(totals.spend, totals.purchases),
    roas: calcRoas(totals.revenue, totals.spend),
    conversion_rate: calcConversionRate(totals.purchases, totals.clicks),
  }
}
