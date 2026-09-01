import { sendMetaPurchase } from '@/lib/analytics/meta-conversions'
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
}): Promise<MetaPurchaseBackfillSummary> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const dryRun = options?.dryRun === true
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
  const { data: rows, error } = await admin
    .from('purchases')
    .select(
      'id, razorpay_payment_id, customer_email, customer_phone, amount_paise, currency, plan_slug, created_at'
    )
    .eq('status', 'captured')
    .in('meta_purchase_status', ['skipped_no_config', 'failed'])
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    summary.errors.push(error.message)
    return summary
  }

  if (!rows?.length) return summary

  for (const row of rows) {
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
