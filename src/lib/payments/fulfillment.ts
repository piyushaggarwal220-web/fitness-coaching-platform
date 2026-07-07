import { createAdminClient } from '@/lib/supabase/admin'
import { hasAccessSourceColumn } from '@/lib/db/profile-columns'
import type { CoachingPlan } from '@/lib/payments/plans'
import type { Purchase } from '@/types/database'

export type FulfillPurchaseInput = {
  email: string
  password: string
  name: string
  plan: CoachingPlan
  razorpayPaymentId: string
  razorpayOrderId: string
  amountPaise: number
}

export type FulfillPurchaseResult = {
  userId: string
  purchaseId: string
  isNewUser: boolean
}

export async function fulfillPurchase(input: FulfillPurchaseInput): Promise<FulfillPurchaseResult> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()

  const { data: existingPurchase } = await admin
    .from('purchases')
    .select('id, user_id')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle()

  if (existingPurchase?.user_id) {
    return {
      userId: existingPurchase.user_id,
      purchaseId: existingPurchase.id,
      isNewUser: false,
    }
  }

  let userId: string
  let isNewUser = false

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  })

  if (createError || !created.user) {
    const { data: profileByEmail } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (!profileByEmail?.id) {
      throw new Error(createError?.message ?? 'Failed to create or find customer account')
    }

    userId = profileByEmail.id
  } else {
    userId = created.user.id
    isNewUser = true
  }

  const now = new Date().toISOString()
  const includeAccessSource = await hasAccessSourceColumn()

  const profilePayload: Record<string, unknown> = {
    id: userId,
    email,
    name: input.name.trim(),
    payment_confirmed: true,
    onboarding_complete: false,
    updated_at: now,
  }

  if (includeAccessSource) {
    profilePayload.access_source = 'purchase'
  }

  const { error: profileError } = await admin.from('profiles').upsert(profilePayload)

  if (profileError) {
    throw new Error(`Failed to create profile: ${profileError.message}`)
  }

  let purchaseId = existingPurchase?.id

  if (!purchaseId) {
    const { data: purchase, error: purchaseError } = await admin
      .from('purchases')
      .insert({
        user_id: userId,
        razorpay_payment_id: input.razorpayPaymentId,
        razorpay_order_id: input.razorpayOrderId,
        plan_slug: input.plan.slug,
        plan_name: input.plan.name,
        amount_paise: input.amountPaise,
        currency: 'INR',
        status: 'captured',
        customer_email: email,
        customer_name: input.name.trim(),
      })
      .select()
      .single()

    if (purchaseError || !purchase) {
      throw new Error(purchaseError?.message ?? 'Failed to store purchase')
    }

    purchaseId = (purchase as Purchase).id
  }

  return { userId, purchaseId, isNewUser }
}
