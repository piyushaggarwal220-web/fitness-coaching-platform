import { recordCapturedPayment } from '@/lib/payments/fulfillment'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { getCoachingPlan, getPurchasablePlan } from '@/lib/payments/plans'
import {
  fetchRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  verifyRazorpaySignature,
} from '@/lib/payments/razorpay'
import { shouldBypassPayment } from '@/lib/config'
import { sendAccountSetupRecovery } from '@/lib/notifications/lifecycle'
import { previewAdLandingPath } from '@/lib/analytics/ad-landing'
import { sendMetaPurchase } from '@/lib/analytics/meta-conversions'
import { queueMetaPurchaseForRecordedSale } from '@/lib/analytics/meta-purchase-dispatch'
import { metaAttributionFromRequest } from '@/lib/analytics/meta-attribution'
import { getOrderPolicyAcknowledgement } from '@/lib/payments/policy-acknowledgement'
import { isCurrentPolicyAcknowledgement } from '@/lib/policies'
import {
  checkoutAddonsFromNotes,
  expectedAmountPaiseFromOrderNotes,
  normalizeDiscountCode,
} from '@/lib/payments/checkout-discounts'
import { isAffiliateDiscountCode } from '@/lib/payments/affiliate-codes'
import { notifyAffiliateCodeUsage } from '@/lib/payments/affiliate-notify'
import { recordPromoCodeUsage } from '@/lib/payments/promo-codes'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAppBaseUrl } from '@/lib/admin/portal-urls'

export type CheckoutPaymentResult =
  | {
      ok: true
      redirectTo: string
      purchaseId: string
      alreadyClaimed: boolean
      message?: string
    }
  | { ok: false; status: number; error: string }

export type CompleteCheckoutPaymentInput = {
  request: Request
  planSlug?: string | null
  email?: string | null
  name?: string | null
  phone?: string | null
  meta_fbp?: string | null
  meta_fbc?: string | null
  landingPath?: string | null
  orderId: string
  paymentId: string
  signature?: string | null
  /**
   * Browser return after UPI / in-app redirect. Identity comes from the Razorpay
   * order notes, and the signature check can be skipped only after this server
   * has already loaded a captured payment for that order.
   */
  identityFromOrder?: boolean
  verifiedByApi?: boolean
}

function setupRedirect(input: {
  alreadyClaimed: boolean
  claimToken: string | null
  email: string
  paymentId: string
}): { redirectTo: string; message?: string } {
  const appBase = resolveAppBaseUrl().replace(/\/$/, '')
  if (input.alreadyClaimed) {
    return {
      redirectTo: `${appBase}/login?${new URLSearchParams({
        email: input.email,
        setup: '1',
      }).toString()}`,
      message: 'This payment already has an account. Please sign in.',
    }
  }
  if (input.claimToken) {
    return {
      redirectTo: `${appBase}/create-account?token=${encodeURIComponent(input.claimToken)}`,
    }
  }
  const params = new URLSearchParams({
    email: input.email,
    paymentId: input.paymentId,
  })
  return { redirectTo: `${appBase}/create-account?${params.toString()}` }
}

/** Record a captured coaching checkout and return the account-setup URL. */
export async function completeCheckoutPayment(
  input: CompleteCheckoutPaymentInput
): Promise<CheckoutPaymentResult> {
  const orderId = input.orderId.trim()
  const paymentId = input.paymentId.trim()
  const signature = input.signature?.trim() ?? ''
  const clientEmail = input.email?.trim().toLowerCase() ?? ''
  const clientName = input.name?.trim() ?? ''

  if (!input.identityFromOrder) {
    const plan = getCoachingPlan(input.planSlug)
    if (!plan) return { ok: false, status: 400, error: 'Invalid plan' }
    if (!getPurchasablePlan(plan.slug)) {
      return {
        ok: false,
        status: 400,
        error:
          'This plan is no longer available. Choose a coaching plan or a customised digital plan at checkout.',
      }
    }
    if (!clientEmail) return { ok: false, status: 400, error: 'Email is required' }
    if (!clientName) return { ok: false, status: 400, error: 'Name is required' }
  }

  if (!orderId) return { ok: false, status: 400, error: 'Payment order id is required' }

  let policyAcknowledgement
  try {
    policyAcknowledgement = await getOrderPolicyAcknowledgement(createAdminClient(), orderId)
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'Could not verify agreement',
    }
  }
  if (!isCurrentPolicyAcknowledgement(policyAcknowledgement)) {
    return { ok: false, status: 400, error: 'Current Terms and Refund Policy agreement is required' }
  }

  let plan = getCoachingPlan(input.planSlug)
  let trustedEmail = clientEmail
  let trustedName = clientName
  let trustedPhone = input.phone?.trim() || null
  let chargedAmountPaise = plan?.amountPaise ?? 0
  let appliedDiscountCode = ''
  let appliedDiscountPaise = 0
  let supplementAddonPaid = 0
  let paidAddonIds: import('@/lib/payments/checkout-discounts').CheckoutAddonId[] = []
  let orderNotes: Record<string, string> = {}

  if (!shouldBypassPayment()) {
    if (!paymentId) return { ok: false, status: 400, error: 'Payment verification fields are required' }
    if (!input.verifiedByApi) {
      if (!signature) return { ok: false, status: 400, error: 'Payment verification fields are required' }
      if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
        return { ok: false, status: 400, error: 'Invalid payment signature' }
      }
    }

    try {
      const payment = input.verifiedByApi
        ? (await fetchRazorpayOrderPayments(orderId)).find((row) => row.id === paymentId) ??
          (await fetchRazorpayPayment(paymentId))
        : await fetchRazorpayPayment(paymentId)
      if (payment.status !== 'captured') {
        return { ok: false, status: 400, error: `Payment not completed (status: ${payment.status})` }
      }
      if (payment.order_id !== orderId) {
        return { ok: false, status: 400, error: 'Payment order mismatch' }
      }

      const order = await fetchRazorpayOrder(orderId)
      const trustedNotes = { ...(order.notes ?? {}), ...(payment.notes ?? {}) }
      orderNotes = trustedNotes
      plan = getCoachingPlan(trustedNotes.plan_slug || input.planSlug)
      if (!plan || !getPurchasablePlan(plan.slug)) {
        return { ok: false, status: 400, error: 'Invalid plan' }
      }

      const expectedAmount = expectedAmountPaiseFromOrderNotes(plan, trustedNotes)
      appliedDiscountCode = normalizeDiscountCode(trustedNotes.discount_code)
      appliedDiscountPaise = Number(trustedNotes.discount_paise ?? 0) || 0
      const addons = checkoutAddonsFromNotes(trustedNotes)
      paidAddonIds = addons.ids
      supplementAddonPaid = addons.ids.includes('testo_boost') ? 39900 : 0

      if (payment.amount !== expectedAmount) {
        return { ok: false, status: 400, error: 'Payment amount mismatch' }
      }
      if (order.amount !== expectedAmount) {
        return { ok: false, status: 400, error: 'Payment order amount mismatch' }
      }
      chargedAmountPaise = expectedAmount
      const noteEmail = trustedNotes.customer_email?.trim().toLowerCase()
      const noteName = trustedNotes.customer_name?.trim()
      const razorpayEmail = payment.email?.trim().toLowerCase()
      const notePhone = trustedNotes.customer_phone?.trim()
      trustedEmail = noteEmail || razorpayEmail || clientEmail
      trustedName = noteName || clientName
      trustedPhone = notePhone || payment.contact?.trim() || trustedPhone
      if (!trustedEmail || !trustedName) {
        return { ok: false, status: 400, error: 'Payment is missing the buyer name or email' }
      }
      if (clientEmail && noteEmail && noteEmail !== clientEmail) {
        if (!input.identityFromOrder) {
          logPurchaseStep('payment_verified', {
            emailBoundToNotes: true,
            clientEmail,
            noteEmail,
          })
        } else {
          return { ok: false, status: 400, error: 'Payment email does not match this checkout' }
        }
      }
    } catch (err) {
      return {
        ok: false,
        status: 500,
        error: err instanceof Error ? err.message : 'Payment verification failed',
      }
    }
  } else if (!paymentId) {
    return { ok: false, status: 400, error: 'test payment id required in TEST_MODE' }
  }

  if (!plan || !getPurchasablePlan(plan.slug)) {
    return { ok: false, status: 400, error: 'Invalid plan' }
  }
  if (!trustedEmail || !trustedName) {
    return { ok: false, status: 400, error: 'Email and name are required' }
  }

  logPurchaseStep('payment_verified', {
    email: trustedEmail,
    plan: plan.slug,
    paymentId: paymentId || 'test',
    testMode: shouldBypassPayment(),
    amountPaise: chargedAmountPaise,
  })

  try {
    const result = await recordCapturedPayment({
      email: trustedEmail,
      name: trustedName,
      phone: trustedPhone,
      termsPolicyVersion: policyAcknowledgement.termsVersion,
      refundPolicyVersion: policyAcknowledgement.refundPolicyVersion,
      policyAcknowledgedAt: policyAcknowledgement.acknowledgedAt,
      policyAckIpHash: policyAcknowledgement.ipHash,
      plan,
      razorpayPaymentId: paymentId || `test_pay_${Date.now()}`,
      razorpayOrderId: orderId || `test_order_${Date.now()}`,
      amountPaise: chargedAmountPaise,
      supplementAddonPaise: supplementAddonPaid,
      checkoutAddonIds: paidAddonIds,
    })
    queueMetaPurchaseForRecordedSale(result.purchaseId)

    if (appliedDiscountCode && appliedDiscountPaise > 0) {
      const usage = await recordPromoCodeUsage(createAdminClient(), {
        code: appliedDiscountCode,
        purchaseId: result.purchaseId,
        customerEmail: result.customerEmail,
        planSlug: plan.slug,
        discountPaise: appliedDiscountPaise,
      }).catch(() => null)

      if (usage?.recorded && isAffiliateDiscountCode(appliedDiscountCode)) {
        await notifyAffiliateCodeUsage({
          code: appliedDiscountCode,
          referrerLabel: usage.referrerLabel,
          customerEmail: result.customerEmail,
          planSlug: plan.slug,
          discountPaise: appliedDiscountPaise,
          amountPaise: chargedAmountPaise,
          purchaseId: result.purchaseId,
        }).catch(() => undefined)
      }
    }

    const metaAttribution = metaAttributionFromRequest(
      input.request,
      { meta_fbp: input.meta_fbp, meta_fbc: input.meta_fbc },
      orderNotes
    )

    await Promise.allSettled([
      sendMetaPurchase({
        purchaseId: result.purchaseId,
        paymentId: result.razorpayPaymentId,
        email: result.customerEmail,
        phone: trustedPhone,
        amountPaise: chargedAmountPaise,
        currency: 'INR',
        planSlug: plan.slug,
        eventSourcePath:
          previewAdLandingPath(orderNotes.landing_path) ??
          previewAdLandingPath(input.landingPath) ??
          undefined,
        ...metaAttribution,
      }),
      sendAccountSetupRecovery({
        purchaseId: result.purchaseId,
        token: result.claimToken,
        paymentId: result.razorpayPaymentId,
        email: result.customerEmail,
        phone: trustedPhone,
        name: result.customerName,
        stage: 'confirmed',
        planSlug: plan.slug,
        planName: plan.name,
      }),
    ])

    const next = setupRedirect({
      alreadyClaimed: result.alreadyClaimed,
      claimToken: result.claimToken,
      email: result.customerEmail,
      paymentId: result.razorpayPaymentId,
    })
    return {
      ok: true,
      purchaseId: result.purchaseId,
      alreadyClaimed: result.alreadyClaimed,
      redirectTo: next.redirectTo,
      message: next.message,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record payment'
    logPurchaseStep('fulfillment_failed', { email: trustedEmail, error: message })
    return { ok: false, status: 500, error: message }
  }
}

/** Same browser comes back to the pay page after UPI. Confirm the order with Razorpay, then continue setup. */
export async function resumeCheckoutPayment(input: {
  request: Request
  orderId: string
  email: string
}): Promise<CheckoutPaymentResult | { ok: false; status: number; error: string; pending?: boolean }> {
  const orderId = input.orderId.trim()
  const email = input.email.trim().toLowerCase()
  if (!orderId.startsWith('order_') || !email.includes('@')) {
    return { ok: false, status: 400, error: 'Payment return is missing the order or email' }
  }

  const order = await fetchRazorpayOrder(orderId)
  const noteEmail = order.notes?.customer_email?.trim().toLowerCase() ?? ''
  if (!noteEmail || noteEmail !== email) {
    return { ok: false, status: 400, error: 'Payment email does not match this checkout' }
  }

  const payments = await fetchRazorpayOrderPayments(orderId)
  const captured = payments.find((row) => row.status === 'captured' && row.order_id === orderId)
  if (!captured) {
    return { ok: false, status: 200, error: 'Payment is not captured yet', pending: true }
  }

  return completeCheckoutPayment({
    request: input.request,
    orderId,
    paymentId: captured.id,
    email,
    name: order.notes?.customer_name,
    phone: order.notes?.customer_phone,
    planSlug: order.notes?.plan_slug,
    landingPath: order.notes?.landing_path,
    identityFromOrder: true,
    verifiedByApi: true,
  })
}
