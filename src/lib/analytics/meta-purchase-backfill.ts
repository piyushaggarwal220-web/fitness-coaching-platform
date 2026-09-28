import { sendMetaPurchase, metaEventSourcePathForPlanSlug } from '@/lib/analytics/meta-conversions'
import { isMetaPurchaseEligibleSale } from '@/lib/analytics/meta-purchase-eligibility'
import { createAdminClient } from '@/lib/supabase/admin'

export type MetaPurchaseBackfillSummary = {
  checked: number
  sent: number
  failed: number
  skipped: number
  errors: string[]
}

/** Replay Meta CAPI Purchase for sales that were skipped or failed. */
export async function backfillMetaPurchases(options?: {
  limit?: number
  dryRun?: boolean
  /** Meta drops events older than about 7 days, so the replay window stays inside that. */
  withinDays?: number
}): Promise<MetaPurchaseBackfillSummary> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const dryRun = options?.dryRun === true
  const withinDays = Math.min(Math.max(options?.withinDays ?? 7, 1), 7)
  const summary: MetaPurchaseBackfillSummary = {
    checked: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  if (!process.env.META_CONVERSIONS_API_TOKEN?.trim()) {
    summary.errors.push('META_CONVERSIONS_API_TOKEN is not configured')
    return summary
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: rows, error } = await admin
    .from('purchases')
    .select(
      'id, razorpay_payment_id, customer_email, customer_phone, amount_paise, currency, plan_slug, plan_name, created_at, meta_purchase_status, status'
    )
    .eq('status', 'captured')
    .gt('amount_paise', 0)
    .gte('created_at', cutoff)
    .or('meta_purchase_status.is.null,meta_purchase_status.in.(skipped_no_config,failed,skipped)')
    .not('razorpay_payment_id', 'like', 'test_%')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    summary.errors.push(error.message)
    return summary
  }

  if (!rows?.length) return summary

  for (const row of rows) {
    if (
      !isMetaPurchaseEligibleSale({
        status: row.status,
        amountPaise: row.amount_paise,
        razorpayPaymentId: row.razorpay_payment_id,
      }) ||
      !row.customer_email
    ) {
      summary.skipped += 1
      continue
    }
    summary.checked += 1
    if (dryRun) {
      summary.skipped += 1
      continue
    }

    const result = await sendMetaPurchase({
      purchaseId: row.id,
      paymentId: row.razorpay_payment_id,
      email: row.customer_email,
      phone: row.customer_phone,
      amountPaise: row.amount_paise,
      currency: row.currency || 'INR',
      planSlug: row.plan_slug,
      contentName: row.plan_name,
      eventSourcePath: metaEventSourcePathForPlanSlug(row.plan_slug),
      eventTime: Math.floor(new Date(row.created_at).getTime() / 1000),
    })

    if (result.skipped) summary.skipped += 1
    else if (result.ok) summary.sent += 1
    else {
      summary.failed += 1
      if (result.error) summary.errors.push(`${row.id}: ${result.error}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return summary
}
