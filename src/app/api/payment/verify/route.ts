import { NextResponse } from 'next/server'
import { recordCapturedPayment, issuePurchaseClaimToken } from '@/lib/payments/fulfillment'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { getCoachingPlan, getPurchasablePlan } from '@/lib/payments/plans'
import {
  fetchRazorpayPayment,
  fetchRazorpayOrder,
  verifyRazorpaySignature,
} from '@/lib/payments/razorpay'
import { shouldBypassPayment } from '@/lib/config'
import { sendAccountSetupRecovery } from '@/lib/notifications/lifecycle'
import { sendMetaPurchase } from '@/lib/analytics/meta-conversions'
import { metaAttributionFromRequest } from '@/lib/analytics/meta-attribution'
import { getOrderPolicyAcknowledgement } from '@/lib/payments/policy-acknowledgement'
import {
  isCurrentPolicyAcknowledgement,
  type CheckoutPolicyAcknowledgement,
} from '@/lib/policies'
import {
  expectedAmountPaiseFromOrderNotes,
  normalizeDiscountCode,
  checkoutAddonsFromNotes,
  supplementAddonPaiseFromNotes,
} from '@/lib/payments/checkout-discounts'
import { isAffiliateDiscountCode } from '@/lib/payments/affiliate-codes'
import { notifyAffiliateCodeUsage } from '@/lib/payments/affiliate-notify'
import { recordPromoCodeUsage } from '@/lib/payments/promo-codes'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAppBaseUrl } from '@/lib/admin/portal-urls'

type VerifyPaymentBody = {
  planSlug?: string
  email?: string
  name?: string
  phone?: string
  meta_fbp?: string
  meta_fbc?: string
  razorpay_order_id?: string
  razorpay_payment_id?: string
  razorpay_signature?: string
}

export async function POST(request: Request) {
  let body: VerifyPaymentBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const plan = getCoachingPlan(body.planSlug)
  const clientEmail = body.email?.trim().toLowerCase() ?? ''
  const clientName = body.name?.trim() ?? ''

  if (!plan) {
    return NextResponse.json({ success: false, error: 'Invalid plan' }, { status: 400 })
  }
  if (!getPurchasablePlan(plan.slug)) {
    return NextResponse.json(
      {
        success: false,
        error: 'This plan is no longer available. Choose a 3, 6, or 12 month plan at checkout.',
      },
      { status: 400 }
    )
  }
  if (!clientEmail) {
    return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 })
  }
  if (!clientName) {
    return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
  }

  const orderId = body.razorpay_order_id ?? ''
  const paymentId = body.razorpay_payment_id ?? ''
  const signature = body.razorpay_signature ?? ''

  let trustedEmail = clientEmail
  let trustedName = clientName
  let trustedPhone = body.phone?.trim() || null
  let policyAcknowledgement: CheckoutPolicyAcknowledgement | null = null
  let chargedAmountPaise = plan.amountPaise
  let appliedDiscountCode = ''
  let appliedDiscountPaise = 0
  let supplementAddonPaid = 0
  let paidAddonIds: import('@/lib/payments/checkout-discounts').CheckoutAddonId[] = []

  if (!orderId) {
    return NextResponse.json(
      { success: false, error: 'Payment order id is required' },
      { status: 400 }
    )
  }

  try {
    policyAcknowledgement = await getOrderPolicyAcknowledgement(createAdminClient(), orderId)
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Could not verify agreement' },
      { status: 500 }
    )
  }
  if (!isCurrentPolicyAcknowledgement(policyAcknowledgement)) {
    return NextResponse.json(
      { success: false, error: 'Current Terms and Refund Policy agreement is required' },
      { status: 400 }
    )
  }

  if (!shouldBypassPayment()) {
    if (!paymentId || !signature) {
      return NextResponse.json(
        { success: false, error: 'Payment verification fields are required' },
        { status: 400 }
      )
    }

    if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
      return NextResponse.json(
        { success: false, error: 'Invalid payment signature' },
        { status: 400 }
      )
    }

    try {
      const payment = await fetchRazorpayPayment(paymentId)
      if (payment.status !== 'captured') {
        return NextResponse.json(
          { success: false, error: `Payment not completed (status: ${payment.status})` },
          { status: 400 }
        )
      }
      if (payment.order_id !== orderId) {
        return NextResponse.json(
          { success: false, error: 'Payment order mismatch' },
          { status: 400 }
        )
      }

      const order = await fetchRazorpayOrder(orderId)
      const trustedNotes = { ...(order.notes ?? {}), ...(payment.notes ?? {}) }
      const expectedAmount = expectedAmountPaiseFromOrderNotes(plan, trustedNotes)
      appliedDiscountCode = normalizeDiscountCode(trustedNotes.discount_code)
      appliedDiscountPaise = Number(trustedNotes.discount_paise ?? 0) || 0
      const addons = checkoutAddonsFromNotes(trustedNotes)
      paidAddonIds = addons.ids
      supplementAddonPaid = addons.ids.includes('testo_boost')
        ? 39900
        : 0

      if (payment.amount !== expectedAmount) {
        return NextResponse.json(
          { success: false, error: 'Payment amount mismatch' },
          { status: 400 }
        )
      }
      if (order.amount !== expectedAmount) {
        return NextResponse.json(
          { success: false, error: 'Payment order amount mismatch' },
          { status: 400 }
        )
      }
      chargedAmountPaise = expectedAmount
      const noteEmail = trustedNotes.customer_email?.trim().toLowerCase()
      const noteName = trustedNotes.customer_name?.trim()
      const razorpayEmail = payment.email?.trim().toLowerCase()
      const notePhone = trustedNotes.customer_phone?.trim()
      trustedEmail = noteEmail || razorpayEmail || clientEmail
      trustedName = noteName || clientName
      trustedPhone = notePhone || payment.contact?.trim() || trustedPhone
      if (noteEmail && noteEmail !== clientEmail) {
        logPurchaseStep('payment_verified', {
          emailBoundToNotes: true,
          clientEmail,
          noteEmail,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment verification failed'
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  } else {
    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: 'test payment id required in TEST_MODE' },
        { status: 400 }
      )
    }
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

    const metaAttribution = metaAttributionFromRequest(request, body)

    await Promise.allSettled([
      sendMetaPurchase({
        purchaseId: result.purchaseId,
        paymentId: result.razorpayPaymentId,
        email: result.customerEmail,
        phone: trustedPhone,
        amountPaise: chargedAmountPaise,
        currency: 'INR',
        planSlug: plan.slug,
        ...metaAttribution,
      }),
      result.claimToken
        ? sendAccountSetupRecovery({
            purchaseId: result.purchaseId,
            token: result.claimToken,
            email: result.customerEmail,
            phone: trustedPhone,
            name: result.customerName,
            stage: 'confirmed',
          })
        : Promise.resolve({ sent: 0, skipped: 1, failed: 0 }),
    ])

    if (result.alreadyClaimed) {
      const appBase = resolveAppBaseUrl().replace(/\/$/, '')
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        purchaseId: result.purchaseId,
        redirectTo: `${appBase}/login`,
        message: 'This payment already has an account. Please sign in.',
      })
    }

    let claimToken = result.claimToken
    if (!claimToken) {
      // Browser just paid — mint a fresh setup token so the buyer continues
      // without typing their Razorpay payment ID.
      try {
        claimToken = await issuePurchaseClaimToken(result.purchaseId)
      } catch {
        claimToken = null
      }
    }

    const appBase = resolveAppBaseUrl().replace(/\/$/, '')

    if (claimToken) {
      return NextResponse.json({
        success: true,
        purchaseId: result.purchaseId,
        redirectTo: `${appBase}/create-account?token=${encodeURIComponent(claimToken)}`,
      })
    }

    // Fallback if token minting failed — recover via email + payment id.
    const params = new URLSearchParams({
      email: result.customerEmail,
      paymentId: result.razorpayPaymentId,
    })
    return NextResponse.json({
      success: true,
      purchaseId: result.purchaseId,
      redirectTo: `${appBase}/create-account?${params.toString()}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record payment'
    logPurchaseStep('fulfillment_failed', { email: trustedEmail, error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
