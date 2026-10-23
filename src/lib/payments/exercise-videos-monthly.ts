import { queueMetaPurchaseForRecordedSale } from '@/lib/analytics/meta-purchase-dispatch'
import { createAdminClient } from '@/lib/supabase/admin'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import {
  EXERCISE_VIDEOS_MONTHLY_ID,
  EXERCISE_VIDEOS_MONTHLY_LABEL,
  EXERCISE_VIDEOS_MONTHLY_PAISE,
} from '@/lib/payments/checkout-discounts'

export const EXERCISE_VIDEOS_MONTHLY_KIND = 'exercise_videos_monthly'
export const EXERCISE_VIDEOS_MONTHLY_PLAN_SLUG = EXERCISE_VIDEOS_MONTHLY_ID

export function isExerciseVideosMonthlyOrder(
  notes: Record<string, string | undefined> | null | undefined
): boolean {
  return notes?.kind === EXERCISE_VIDEOS_MONTHLY_KIND
}

export async function fulfillExerciseVideosMonthly(input: {
  userId: string
  email: string
  name: string
  phone?: string | null
  razorpayPaymentId: string
  razorpayOrderId: string
  amountPaise: number
}): Promise<{ purchaseId: string; alreadyRecorded: boolean }> {
  if (input.amountPaise !== EXERCISE_VIDEOS_MONTHLY_PAISE) {
    throw new Error('Exercise videos amount mismatch')
  }

  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()

  const { data: existing } = await admin
    .from('purchases')
    .select('id')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle()

  if (existing?.id) {
    queueMetaPurchaseForRecordedSale(existing.id as string)
    return { purchaseId: existing.id as string, alreadyRecorded: true }
  }

  const now = new Date().toISOString()
  const { data: inserted, error } = await admin
    .from('purchases')
    .insert({
      user_id: input.userId,
      razorpay_payment_id: input.razorpayPaymentId,
      razorpay_order_id: input.razorpayOrderId,
      plan_slug: EXERCISE_VIDEOS_MONTHLY_PLAN_SLUG,
      plan_name: EXERCISE_VIDEOS_MONTHLY_LABEL,
      amount_paise: EXERCISE_VIDEOS_MONTHLY_PAISE,
      currency: 'INR',
      status: 'captured',
      customer_email: email,
      customer_name: input.name.trim() || null,
      customer_phone: input.phone ?? null,
      claimed_at: now,
      checkout_addon_ids: [EXERCISE_VIDEOS_MONTHLY_ID],
      supplement_addon: false,
      supplement_addon_paise: EXERCISE_VIDEOS_MONTHLY_PAISE,
      subscription_status: 'active',
    })
    .select('id')
    .single()

  if (error || !inserted) {
    logPurchaseStep('payment_record_failed', {
      userId: input.userId,
      error: error?.message,
      addon: EXERCISE_VIDEOS_MONTHLY_ID,
    })
    throw new Error(error?.message ?? 'Failed to record exercise videos purchase')
  }

  queueMetaPurchaseForRecordedSale(inserted.id as string)
  return { purchaseId: inserted.id as string, alreadyRecorded: false }
}
