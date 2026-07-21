import { NextResponse } from 'next/server'
import { recordCapturedPayment } from '@/lib/payments/fulfillment'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { getCoachingPlan } from '@/lib/payments/plans'
import {
  fetchRazorpayPayment,
  verifyRazorpaySignature,
} from '@/lib/payments/razorpay'
import { shouldBypassPayment } from '@/lib/config'
import { sendAccountSetupRecovery } from '@/lib/notifications/lifecycle'
import { sendMetaPurchase } from '@/lib/analytics/meta-conversions'

type VerifyPaymentBody = {
  planSlug?: string
  email?: string
  name?: string
  phone?: string
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
  let refundPolicyVersion: string | null = shouldBypassPayment() ? '2026-07-21' : null
  let refundPolicyAcknowledgedAt: string | null = shouldBypassPayment() ? new Date().toISOString() : null

  if (!shouldBypassPayment()) {
    if (!orderId || !paymentId || !signature) {
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
      if (payment.amount !== plan.amountPaise) {
        return NextResponse.json(
          { success: false, error: 'Payment amount mismatch' },
          { status: 400 }
        )
      }

      const noteEmail = payment.notes?.customer_email?.trim().toLowerCase()
      const noteName = payment.notes?.customer_name?.trim()
      const razorpayEmail = payment.email?.trim().toLowerCase()
      const notePhone = payment.notes?.customer_phone?.trim()
      trustedEmail = noteEmail || razorpayEmail || clientEmail
      trustedName = noteName || clientName
      trustedPhone = notePhone || payment.contact?.trim() || trustedPhone
      refundPolicyVersion = payment.notes?.refund_policy_version?.trim() || null
      refundPolicyAcknowledgedAt = payment.notes?.refund_policy_acknowledged_at?.trim() || null

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
  })

  try {
    const result = await recordCapturedPayment({
      email: trustedEmail,
      name: trustedName,
      phone: trustedPhone,
      refundPolicyVersion,
      refundPolicyAcknowledgedAt,
      plan,
      razorpayPaymentId: paymentId || `test_pay_${Date.now()}`,
      razorpayOrderId: orderId || `test_order_${Date.now()}`,
      amountPaise: plan.amountPaise,
    })

    await Promise.allSettled([
      sendMetaPurchase({
        purchaseId: result.purchaseId,
        paymentId: result.razorpayPaymentId,
        email: result.customerEmail,
        phone: trustedPhone,
        amountPaise: plan.amountPaise,
        currency: 'INR',
        planSlug: plan.slug,
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
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        purchaseId: result.purchaseId,
        redirectTo: '/login',
        message: 'This payment already has an account. Please sign in.',
      })
    }

    if (result.claimToken) {
      return NextResponse.json({
        success: true,
        purchaseId: result.purchaseId,
        redirectTo: `/create-account?token=${encodeURIComponent(result.claimToken)}`,
      })
    }

    // Token already issued — recover via email + payment id.
    const params = new URLSearchParams({
      email: result.customerEmail,
      paymentId: result.razorpayPaymentId,
    })
    return NextResponse.json({
      success: true,
      purchaseId: result.purchaseId,
      redirectTo: `/create-account?${params.toString()}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record payment'
    logPurchaseStep('fulfillment_failed', { email: trustedEmail, error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
