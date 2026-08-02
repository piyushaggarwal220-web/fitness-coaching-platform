import { NextResponse } from 'next/server'
import { getPurchasablePlan, isTrialPlanSlug } from '@/lib/payments/plans'
import { shouldBypassPayment } from '@/lib/config'
import { createRazorpayOrder, getRazorpayKeyId } from '@/lib/payments/razorpay'
import {
  createPolicyAcknowledgement,
  storeOrderPolicyAcknowledgement,
} from '@/lib/payments/policy-acknowledgement'
import {
  assertCheckoutContactsVerified,
  normalizeCheckoutEmail,
  normalizeCheckoutPhone,
} from '@/lib/payments/checkout-otp'
import {
  checkoutDiscountNotes,
  resolveCheckoutPricing,
} from '@/lib/payments/checkout-discounts'
import { assertTrialPurchaseEligible } from '@/lib/payments/trial-eligibility'
import { createAdminClient } from '@/lib/supabase/admin'

type CreateOrderBody = {
  planSlug?: string
  email?: string
  name?: string
  phone?: string
  policyAgreementAccepted?: boolean
  verificationId?: string
  discountCode?: string
}

export async function POST(request: Request) {
  let body: CreateOrderBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', missing: ['Valid request body'] }, { status: 400 })
  }

  const plan = getPurchasablePlan(body.planSlug)
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan selected', missing: ['A valid plan'] }, { status: 400 })
  }

  const missing: string[] = []
  if (!body.name?.trim()) missing.push('Full name')
  if (!body.email?.trim()) missing.push('Email')
  else if (!normalizeCheckoutEmail(body.email).includes('@')) missing.push('A valid email address')
  if (!body.phone?.trim()) missing.push('WhatsApp number')
  else if (!normalizeCheckoutPhone(body.phone)) missing.push('A valid WhatsApp number (e.g. +91 98765 43210)')
  if (body.policyAgreementAccepted !== true) missing.push('Agree to Terms & Refund Policy')

  if (!shouldBypassPayment()) {
    if (!body.verificationId?.trim()) {
      missing.push('Email verification (tap Send verification email, then open the link)')
    }
  }

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Before you can pay, complete: ${missing.join('; ')}`,
        missing,
      },
      { status: 400 }
    )
  }

  const contactCheck = await assertCheckoutContactsVerified({
    verificationId: body.verificationId,
    email: body.email!,
    phone: body.phone!,
  })
  if (!contactCheck.ok) {
    return NextResponse.json(
      {
        error: contactCheck.error,
        missing: ['Email verification (tap Send verification email, then open the link)'],
      },
      { status: contactCheck.status }
    )
  }

  const acknowledgement = createPolicyAcknowledgement(request)
  const admin = createAdminClient()

  if (isTrialPlanSlug(plan.slug)) {
    const trialCheck = await assertTrialPurchaseEligible({
      admin,
      email: body.email!,
      phone: body.phone!,
    })
    if (!trialCheck.ok) {
      return NextResponse.json(
        { error: trialCheck.error, missing: ['Trial eligibility'], reason: trialCheck.reason },
        { status: trialCheck.status }
      )
    }
  }

  const pricingResult = await resolveCheckoutPricing({
    admin,
    planSlug: plan.slug,
    email: body.email!,
    discountCode: body.discountCode,
  })
  if (!pricingResult.ok) {
    return NextResponse.json(
      { error: pricingResult.error, missing: ['Valid referral code'] },
      { status: pricingResult.status }
    )
  }
  const { pricing } = pricingResult
  const discountNotes = checkoutDiscountNotes(pricing)

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
      amount: pricing.amountPaise,
      currency: 'INR',
      keyId: 'test',
      plan: pricing.plan,
      discount: pricing.discount,
      listAmountPaise: pricing.listAmountPaise,
    })
  }

  try {
    const receipt = `plan_${plan.slug}_${Date.now()}`
    const order = await createRazorpayOrder({
      amountPaise: pricing.amountPaise,
      receipt,
      notes: {
        plan_slug: plan.slug,
        customer_email: body.email!.trim().toLowerCase(),
        customer_name: body.name!.trim(),
        customer_phone: body.phone!.trim(),
        terms_policy_version: acknowledgement.termsVersion,
        refund_policy_version: acknowledgement.refundPolicyVersion,
        policy_acknowledged_at: acknowledgement.acknowledgedAt,
        ...discountNotes,
      },
    })
    await storeOrderPolicyAcknowledgement(admin, order.id, acknowledgement)

    return NextResponse.json({
      testMode: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      plan: pricing.plan,
      discount: pricing.discount,
      listAmountPaise: pricing.listAmountPaise,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
