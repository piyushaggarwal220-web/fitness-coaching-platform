import { NextResponse } from 'next/server'
import { getCoachingPlan } from '@/lib/payments/plans'
import { shouldBypassPayment } from '@/lib/config'
import { createRazorpayOrder, getRazorpayKeyId } from '@/lib/payments/razorpay'
import {
  createPolicyAcknowledgement,
  storeOrderPolicyAcknowledgement,
} from '@/lib/payments/policy-acknowledgement'
import { assertCheckoutContactsVerified } from '@/lib/payments/checkout-otp'
import { createAdminClient } from '@/lib/supabase/admin'

type CreateOrderBody = {
  planSlug?: string
  email?: string
  name?: string
  phone?: string
  policyAgreementAccepted?: boolean
  verificationId?: string
}

export async function POST(request: Request) {
  let body: CreateOrderBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const plan = getCoachingPlan(body.planSlug)
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
  }

  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!body.phone?.trim()) {
    return NextResponse.json({ error: 'WhatsApp number is required' }, { status: 400 })
  }
  if (body.policyAgreementAccepted !== true) {
    return NextResponse.json(
      { error: 'You must agree to the Terms and Refund Policy before payment' },
      { status: 400 }
    )
  }

  const contactCheck = await assertCheckoutContactsVerified({
    verificationId: body.verificationId,
    email: body.email,
    phone: body.phone,
  })
  if (!contactCheck.ok) {
    return NextResponse.json({ error: contactCheck.error }, { status: contactCheck.status })
  }

  const acknowledgement = createPolicyAcknowledgement(request)
  const admin = createAdminClient()

  if (shouldBypassPayment()) {
    const orderId = `test_order_${Date.now()}`
    try {
      await storeOrderPolicyAcknowledgement(admin, orderId, acknowledgement)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to record agreement' },
        { status: 500 }
      )
    }
    return NextResponse.json({
      testMode: true,
      orderId,
      amount: plan.amountPaise,
      currency: 'INR',
      keyId: 'test',
      plan,
    })
  }

  try {
    const receipt = `plan_${plan.slug}_${Date.now()}`
    const order = await createRazorpayOrder({
      amountPaise: plan.amountPaise,
      receipt,
      notes: {
        plan_slug: plan.slug,
        customer_email: body.email.trim().toLowerCase(),
        customer_name: body.name.trim(),
        customer_phone: body.phone.trim(),
        terms_policy_version: acknowledgement.termsVersion,
        refund_policy_version: acknowledgement.refundPolicyVersion,
        policy_acknowledged_at: acknowledgement.acknowledgedAt,
      },
    })
    await storeOrderPolicyAcknowledgement(admin, order.id, acknowledgement)

    return NextResponse.json({
      testMode: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      plan,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
