import { createAdminClient } from '@/lib/supabase/admin'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import {
  PLATFORM_UNLOCK_KIND,
  PLATFORM_UNLOCK_META,
  type PlatformUnlockSku,
} from '@/lib/payments/platform-unlock-catalog'
import type { InstantFeature } from '@/lib/instant-feature-access'

export { PLATFORM_UNLOCK_KIND }

export function isPlatformUnlockOrder(
  notes: Record<string, string | undefined> | null | undefined
): boolean {
  return notes?.kind === PLATFORM_UNLOCK_KIND
}

function entitlementPatch(features: InstantFeature[]): Record<string, boolean | string> {
  const patch: Record<string, boolean | string> = {
    updated_at: new Date().toISOString(),
  }
  if (features.includes('tracker')) patch.addon_tracker_entitled = true
  if (features.includes('journey')) patch.addon_journey_entitled = true
  if (features.includes('ai_chat')) patch.addon_ai_chat_entitled = true
  return patch
}

export async function fulfillPlatformUnlockAddon(input: {
  userId: string
  email: string
  name: string
  phone?: string | null
  razorpayPaymentId: string
  razorpayOrderId: string
  amountPaise: number
  sku: PlatformUnlockSku
}): Promise<{ purchaseId: string; alreadyRecorded: boolean }> {
  const meta = PLATFORM_UNLOCK_META[input.sku]
  if (input.amountPaise !== meta.amountPaise) {
    throw new Error('Platform unlock amount mismatch')
  }

  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const patch = entitlementPatch(meta.features)

  const { data: existing } = await admin
    .from('purchases')
    .select('id')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle()

  if (existing?.id) {
    await admin.from('profiles').update(patch).eq('id', input.userId)
    return { purchaseId: existing.id as string, alreadyRecorded: true }
  }

  const now = new Date().toISOString()
  const { data: inserted, error } = await admin
    .from('purchases')
    .insert({
      user_id: input.userId,
      razorpay_payment_id: input.razorpayPaymentId,
      razorpay_order_id: input.razorpayOrderId,
      plan_slug: input.sku,
      plan_name: meta.label,
      amount_paise: meta.amountPaise,
      currency: 'INR',
      status: 'captured',
      customer_email: email,
      customer_name: input.name.trim() || null,
      customer_phone: input.phone ?? null,
      claimed_at: now,
      checkout_addon_ids: [input.sku],
      supplement_addon: false,
      supplement_addon_paise: meta.amountPaise,
      subscription_status: 'active',
    })
    .select('id')
    .single()

  if (error || !inserted) {
    logPurchaseStep('payment_record_failed', {
      userId: input.userId,
      error: error?.message,
      addon: input.sku,
    })
    throw new Error(error?.message ?? 'Failed to record platform unlock purchase')
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update(patch)
    .eq('id', input.userId)

  if (profileError) {
    throw new Error(profileError.message || 'Failed to unlock platform feature')
  }

  return { purchaseId: inserted.id as string, alreadyRecorded: false }
}
