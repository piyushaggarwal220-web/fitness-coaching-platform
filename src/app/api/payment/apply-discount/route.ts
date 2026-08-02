import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateRedemptionCode } from '@/lib/redemption-codes'
import {
  getFirstTimerDiscountCode,
  normalizeDiscountCode,
  resolveCheckoutPricing,
} from '@/lib/payments/checkout-discounts'

type Body = {
  planSlug?: string
  email?: string
  code?: string
}

/**
 * Preview a checkout discount or detect an enrollment/membership redemption code.
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const code = normalizeDiscountCode(body.code)
  if (!code) {
    return NextResponse.json({ error: 'Enter a referral code.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Enrollment / membership codes stay on the /enroll flow.
  const enrollment = await validateRedemptionCode(code, admin)
  if (enrollment.valid && enrollment.code) {
    return NextResponse.json({
      kind: 'enrollment',
      code,
      message: 'This is a membership enrollment code. Continue on the enrollment page to redeem it.',
      enrollHref: `/enroll?code=${encodeURIComponent(code)}`,
      planSlug: enrollment.code.plan_slug,
      planName: enrollment.planName,
    })
  }

  const resolved = await resolveCheckoutPricing({
    admin,
    planSlug: body.planSlug ?? '3_months',
    email: body.email ?? '',
    discountCode: code,
  })

  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }

  const { pricing } = resolved
  return NextResponse.json({
    kind: 'discount',
    code: pricing.discount?.code ?? getFirstTimerDiscountCode(),
    planSlug: pricing.plan.slug,
    planName: pricing.plan.name,
    listAmountPaise: pricing.listAmountPaise,
    amountPaise: pricing.amountPaise,
    discountPaise: pricing.discount?.discountPaise ?? 0,
    displayListPrice: pricing.discount?.displayListPrice ?? pricing.plan.displayPrice,
    displaySalePrice: pricing.discount?.displaySalePrice ?? pricing.plan.displayPrice,
    displayDiscount: pricing.discount?.displayDiscount ?? '₹0',
    message: pricing.discount
      ? `Referral applied — save ${pricing.discount.displayDiscount} on ${pricing.plan.name}.`
      : 'No referral discount applied.',
  })
}
