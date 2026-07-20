import { NextResponse } from 'next/server'
import { recordCapturedPayment } from '@/lib/payments/fulfillment'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { getCoachingPlan } from '@/lib/payments/plans'
import {
  fetchRazorpayPayment,
  verifyRazorpaySignature,
} from '@/lib/payments/razorpay'
import { shouldBypassPayment } from '@/lib/config'

type VerifyPaymentBody = {
  planSlug?: string
  email?: string
  name?: string
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
  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()

  if (!plan) {
    return NextResponse.json({ success: false, error: 'Invalid plan' }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
  }

  const orderId = body.razorpay_order_id ?? ''
  const paymentId = body.razorpay_payment_id ?? ''
  const signature = body.razorpay_signature ?? ''

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
      if (payment.status !== 'captured' && payment.status !== 'authorized') {
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
    email,
    plan: plan.slug,
    paymentId: paymentId || 'test',
    testMode: shouldBypassPayment(),
  })

  try {
    const result = await recordCapturedPayment({
      email,
      name,
      plan,
      razorpayPaymentId: paymentId || `test_pay_${Date.now()}`,
      razorpayOrderId: orderId || `test_order_${Date.now()}`,
      amountPaise: plan.amountPaise,
    })

    if (result.alreadyClaimed) {
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        purchaseId: result.purchaseId,
        redirectTo: '/login',
        message: 'This payment already has an account. Please sign in.',
      })
    }

    if (!result.claimToken) {
      return NextResponse.json(
        { success: false, error: 'Payment recorded but setup token was missing' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      purchaseId: result.purchaseId,
      redirectTo: `/create-account?token=${encodeURIComponent(result.claimToken)}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record payment'
    logPurchaseStep('fulfillment_failed', { email, error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
