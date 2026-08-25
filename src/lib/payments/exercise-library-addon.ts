import { createAdminClient } from '@/lib/supabase/admin'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import {
  EXERCISE_LIBRARY_ADDON_ID,
  EXERCISE_LIBRARY_ADDON_PAISE,
} from '@/lib/payments/checkout-discounts'

export const EXERCISE_LIBRARY_ADDON_KIND = 'exercise_library_addon'
export const EXERCISE_LIBRARY_PLAN_SLUG = 'exercise_library'

export function isExerciseLibraryAddonOrder(
  notes: Record<string, string | undefined> | null | undefined
): boolean {
  return notes?.kind === EXERCISE_LIBRARY_ADDON_KIND
}

export async function fulfillExerciseLibraryAddon(input: {
  userId: string
  email: string
  name: string
  phone?: string | null
  razorpayPaymentId: string
  razorpayOrderId: string
  amountPaise: number
}): Promise<{ purchaseId: string; alreadyRecorded: boolean }> {
  if (input.amountPaise !== EXERCISE_LIBRARY_ADDON_PAISE) {
    throw new Error('Exercise library amount mismatch')
  }

  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()

  const { data: existing } = await admin
    .from('purchases')
    .select('id')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle()

  if (existing?.id) {
    await admin
      .from('profiles')
      .update({ exercise_library_entitled: true, updated_at: new Date().toISOString() })
      .eq('id', input.userId)
    return { purchaseId: existing.id as string, alreadyRecorded: true }
  }

  const now = new Date().toISOString()
  const { data: inserted, error } = await admin
    .from('purchases')
    .insert({
      user_id: input.userId,
      razorpay_payment_id: input.razorpayPaymentId,
      razorpay_order_id: input.razorpayOrderId,
      plan_slug: EXERCISE_LIBRARY_PLAN_SLUG,
      plan_name: 'Exercise library',
      amount_paise: EXERCISE_LIBRARY_ADDON_PAISE,
      currency: 'INR',
      status: 'captured',
      customer_email: email,
      customer_name: input.name.trim() || null,
      customer_phone: input.phone ?? null,
      claimed_at: now,
      checkout_addon_ids: [EXERCISE_LIBRARY_ADDON_ID],
      supplement_addon: false,
      supplement_addon_paise: EXERCISE_LIBRARY_ADDON_PAISE,
      subscription_status: 'active',
    })
    .select('id')
    .single()

  if (error || !inserted) {
    logPurchaseStep('payment_record_failed', { userId: input.userId, error: error?.message, addon: 'exercise_library' })
    throw new Error(error?.message ?? 'Failed to record exercise library purchase')
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ exercise_library_entitled: true, updated_at: now })
    .eq('id', input.userId)

  if (profileError) {
    throw new Error(profileError.message || 'Failed to unlock exercise library')
  }

  return { purchaseId: inserted.id as string, alreadyRecorded: false }
}
