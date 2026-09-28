import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMetaPurchaseEligibleSale } from '@/lib/analytics/meta-purchase-eligibility'
import {
  metaEventSourcePathForPlanSlug,
  sendMetaPurchase,
} from '@/lib/analytics/meta-conversions'

/** Runs after immediate browser CAPI and the webhook's 8s backup. */
const BACKUP_DELAY_MS = 12_000
const META_MAX_EVENT_AGE_SEC = 7 * 24 * 60 * 60 - 60

/**
 * Send Purchase for a recorded sale when nothing else has.
 * Skips rows Meta would have to stamp as "now" (older than ~7 days).
 */
export async function dispatchMetaPurchaseForRecordedSale(purchaseId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('purchases')
    .select(
      'id, status, amount_paise, currency, plan_slug, plan_name, customer_email, customer_phone, razorpay_payment_id, created_at, meta_purchase_status'
    )
    .eq('id', purchaseId)
    .maybeSingle()

  if (error || !data) {
    console.error('[meta-capi] recorded-sale lookup failed', {
      purchaseId,
      error: error?.message ?? 'missing',
    })
    return
  }

  if (data.meta_purchase_status === 'sent') return
  if (!isMetaPurchaseEligibleSale(data)) return
  if (!data.customer_email?.trim()) return

  const createdMs = new Date(data.created_at).getTime()
  const ageSec = (Date.now() - createdMs) / 1000
  if (!Number.isFinite(createdMs) || ageSec > META_MAX_EVENT_AGE_SEC || ageSec < -300) return

  await sendMetaPurchase({
    purchaseId: data.id,
    paymentId: data.razorpay_payment_id,
    email: data.customer_email,
    phone: data.customer_phone,
    amountPaise: Number(data.amount_paise),
    currency: data.currency || 'INR',
    planSlug: data.plan_slug,
    contentName: data.plan_name,
    eventSourcePath: metaEventSourcePathForPlanSlug(data.plan_slug),
    eventTime: Math.floor(createdMs / 1000),
  })
}

/** Backup so a sale is still sent if the request path forgot the immediate Purchase call. */
export function queueMetaPurchaseForRecordedSale(purchaseId: string) {
  const run = () =>
    dispatchMetaPurchaseForRecordedSale(purchaseId).catch((err) => {
      console.error('[meta-capi] recorded-sale backup failed', {
        purchaseId,
        error: err instanceof Error ? err.message : 'unknown',
      })
    })

  try {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, BACKUP_DELAY_MS))
      await run()
    })
  } catch {
    void run()
  }
}
