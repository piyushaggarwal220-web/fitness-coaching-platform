/**
 * Shared LURVOX cash-ledger math.
 *
 * Authoritative formulas copied from admin P&L (`computeBusinessAnalytics`):
 * - gross revenue = sum(amount_paise) for status=captured, / 100
 * - refunds = sum(refunded_amount_paise) for status in (captured, refunded), / 100
 * - redeemed enrollment codes are status=redeemed and are not cash revenue
 *
 * Time windows are supplied by the caller. Do not bake Shopify or Meta into this module.
 */

export type PurchaseLedgerRow = {
  status: string
  amount_paise: number | null
  refunded_amount_paise?: number | null
  created_at: string
  currency?: string | null
  plan_slug?: string | null
}

export function filterPurchaseWindow(
  rows: PurchaseLedgerRow[],
  fromInclusive?: Date,
  toExclusive?: Date
): PurchaseLedgerRow[] {
  return rows.filter((row) => {
    const t = new Date(row.created_at).getTime()
    if (Number.isNaN(t)) return false
    if (fromInclusive && t < fromInclusive.getTime()) return false
    if (toExclusive && t >= toExclusive.getTime()) return false
    return true
  })
}

/** Admin `sumPurchaseInr` body: captured gross, including ₹0 captured rows (they add 0). */
export function grossCapturedRevenueInr(rows: PurchaseLedgerRow[]): number {
  return (
    rows
      .filter((row) => row.status === 'captured')
      .reduce((sum, row) => sum + (row.amount_paise ?? 0), 0) / 100
  )
}

/** Admin lifetime refunds formula, applied to the provided row set. */
export function refundsInr(rows: PurchaseLedgerRow[]): number {
  return (
    Math.round(
      (rows
        .filter((row) => row.status === 'captured' || row.status === 'refunded')
        .reduce((sum, row) => sum + (row.refunded_amount_paise ?? 0), 0) /
        100) *
        100
    ) / 100
  )
}

export function netSalesInr(rows: PurchaseLedgerRow[]): number {
  return Math.round((grossCapturedRevenueInr(rows) - refundsInr(rows)) * 100) / 100
}

export function paidCapturedCount(rows: PurchaseLedgerRow[]): number {
  return rows.filter((row) => row.status === 'captured' && (row.amount_paise ?? 0) > 0).length
}

export function redemptionCount(rows: PurchaseLedgerRow[]): number {
  return rows.filter((row) => row.status === 'redeemed').length
}

export function redemptionGrossInr(rows: PurchaseLedgerRow[]): number {
  return (
    rows
      .filter((row) => row.status === 'redeemed')
      .reduce((sum, row) => sum + (row.amount_paise ?? 0), 0) / 100
  )
}

export type PurchaseQueryResult = {
  data: PurchaseLedgerRow[] | null
  error: { message: string } | null
}

/**
 * Convert a Supabase-style query result into ledger rows.
 * Failure/null payload never becomes an empty array (that would look like ₹0).
 */
export function purchaseLedgerFromQuery(result: PurchaseQueryResult):
  | { ok: true; rows: PurchaseLedgerRow[]; data_status: 'verified' }
  | { ok: false; rows: null; data_status: 'failed' | 'unavailable'; error: string } {
  if (result.error) {
    return { ok: false, rows: null, data_status: 'failed', error: result.error.message }
  }
  if (result.data == null) {
    return {
      ok: false,
      rows: null,
      data_status: 'unavailable',
      error: 'Purchase query returned no payload',
    }
  }
  return { ok: true, rows: result.data, data_status: 'verified' }
}

export function summarizePurchaseLedger(rows: PurchaseLedgerRow[]): {
  gross_inr: number
  refunds_inr: number
  net_inr: number
  paid_count: number
  redemption_count: number
  redemption_inr: number
  captured_zero_count: number
} {
  return {
    gross_inr: grossCapturedRevenueInr(rows),
    refunds_inr: refundsInr(rows),
    net_inr: netSalesInr(rows),
    paid_count: paidCapturedCount(rows),
    redemption_count: redemptionCount(rows),
    redemption_inr: redemptionGrossInr(rows),
    captured_zero_count: rows.filter(
      (row) => row.status === 'captured' && (row.amount_paise ?? 0) <= 0
    ).length,
  }
}
