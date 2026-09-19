import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { shouldBypassPayment } from '@/lib/config'
import {
  canAccessInstantFeature,
  type InstantFeature,
} from '@/lib/instant-feature-access'
import { latestCoachingPurchase, latestDigitalPurchase } from '@/lib/payments/digital-purchase'
import {
  fulfillPlatformUnlockAddon,
  PLATFORM_UNLOCK_KIND,
} from '@/lib/payments/platform-unlock-addon'
import {
  PLATFORM_UNLOCK_META,
  parsePlatformUnlockSku,
  type PlatformUnlockSku,
} from '@/lib/payments/platform-unlock-catalog'
import { sendMetaPurchase } from '@/lib/analytics/meta-conversions'
import { metaAttributionFromRequest, razorpayMetaNotes } from '@/lib/analytics/meta-attribution'
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  verifyRazorpaySignature,
} from '@/lib/payments/razorpay'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function alreadyHasSku(
  profile: {
    instant_gates_enabled?: boolean | null
    addon_tracker_entitled?: boolean | null
    addon_journey_entitled?: boolean | null
    addon_ai_chat_entitled?: boolean | null
    access_source?: string | null
  },
  sku: PlatformUnlockSku,
  options: {
    planSlug?: string | null
    hasCoachingPurchase?: boolean
    isInstantOnly?: boolean
  }
): boolean {
  return PLATFORM_UNLOCK_META[sku].features.every((feature: InstantFeature) =>
    canAccessInstantFeature(profile, feature, options)
  )
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  let body: { sku?: string; meta_fbp?: string; meta_fbc?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const sku = parsePlatformUnlockSku(body.sku)
  if (!sku) {
    return NextResponse.json({ error: 'Choose a feature to unlock' }, { status: 400 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select(
      'id, name, email, phone, payment_confirmed, access_source, instant_gates_enabled, addon_tracker_entitled, addon_journey_entitled, addon_ai_chat_entitled'
    )
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json(
      { error: 'Start a plan first, then unlock platform features.' },
      { status: 403 }
    )
  }

  const admin = createAdminClient()
  const [coaching, digital] = await Promise.all([
    latestCoachingPurchase(admin, auth.user.id),
    latestDigitalPurchase(admin, auth.user.id),
  ])
  const isInstantOnly = Boolean(digital) && !coaching
  if (
    alreadyHasSku(profile, sku, {
      hasCoachingPurchase: Boolean(coaching),
      planSlug: digital?.planSlug ?? coaching?.planSlug,
      isInstantOnly,
    })
  ) {
    return NextResponse.json({ entitled: true, alreadyUnlocked: true })
  }

  if (!isInstantOnly && !profile.instant_gates_enabled) {
    return NextResponse.json(
      { error: 'Your plan already includes these features.' },
      { status: 400 }
    )
  }

  const meta = PLATFORM_UNLOCK_META[sku]
  const email = (profile.email || auth.user.email || '').trim().toLowerCase()
  const name = (profile.name || '').trim() || 'Member'
  const phone = (profile.phone || '').trim() || undefined

  if (shouldBypassPayment()) {
    const orderId = `test_unlock_${sku}_${Date.now()}`
    return NextResponse.json({
      testMode: true,
      orderId,
      amount: meta.amountPaise,
      currency: 'INR',
      keyId: 'test',
      email,
      name,
      phone: phone ?? '',
      sku,
    })
  }

  try {
    const order = await createRazorpayOrder({
      amountPaise: meta.amountPaise,
      receipt: `unl_${sku.slice(0, 8)}_${auth.user.id.slice(0, 6)}_${Date.now()}`.slice(0, 40),
      notes: {
        kind: PLATFORM_UNLOCK_KIND,
        user_id: auth.user.id,
        unlock_sku: sku,
        customer_email: email,
        customer_name: name,
        customer_phone: phone ?? '',
        amount_paise: String(meta.amountPaise),
        ...razorpayMetaNotes(body),
      },
    })
    return NextResponse.json({
      testMode: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      email,
      name,
      phone: phone ?? '',
      sku,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start checkout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  let body: {
    razorpay_order_id?: string
    razorpay_payment_id?: string
    razorpay_signature?: string
    sku?: string
    meta_fbp?: string
    meta_fbc?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sku = parsePlatformUnlockSku(body.sku)
  if (!sku) {
    return NextResponse.json({ error: 'Invalid unlock product' }, { status: 400 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('id, name, email, phone, payment_confirmed')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json({ error: 'Membership required' }, { status: 403 })
  }

  const email = (profile.email || auth.user.email || '').trim().toLowerCase()
  const name = (profile.name || '').trim() || 'Member'
  const phone = (profile.phone as string | null) ?? null
  const meta = PLATFORM_UNLOCK_META[sku]

  if (shouldBypassPayment()) {
    const result = await fulfillPlatformUnlockAddon({
      userId: auth.user.id,
      email,
      name,
      phone,
      razorpayPaymentId: body.razorpay_payment_id || `test_pay_${sku}_${Date.now()}`,
      razorpayOrderId: body.razorpay_order_id || `test_order_${sku}_${Date.now()}`,
      amountPaise: meta.amountPaise,
      sku,
    })
    return NextResponse.json({ success: true, entitled: true, purchaseId: result.purchaseId })
  }

  const orderId = body.razorpay_order_id ?? ''
  const paymentId = body.razorpay_payment_id ?? ''
  const signature = body.razorpay_signature ?? ''
  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: 'Missing payment details' }, { status: 400 })
  }
  if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
  }

  const [payment, order] = await Promise.all([
    fetchRazorpayPayment(paymentId),
    fetchRazorpayOrder(orderId),
  ])
  if (payment.order_id !== orderId) {
    return NextResponse.json({ error: 'Payment does not match this order' }, { status: 400 })
  }
  if (payment.amount !== meta.amountPaise) {
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 422 })
  }
  const notes = { ...(order.notes ?? {}), ...(payment.notes ?? {}) }
  if (
    notes.kind !== PLATFORM_UNLOCK_KIND ||
    notes.user_id !== auth.user.id ||
    notes.unlock_sku !== sku
  ) {
    return NextResponse.json({ error: 'This payment is not for your unlock' }, { status: 403 })
  }

  const result = await fulfillPlatformUnlockAddon({
    userId: auth.user.id,
    email,
    name,
    phone,
    razorpayPaymentId: payment.id,
    razorpayOrderId: order.id,
    amountPaise: payment.amount,
    sku,
  })
  await sendMetaPurchase({
    purchaseId: result.purchaseId,
    paymentId: payment.id,
    email,
    phone,
    amountPaise: payment.amount,
    currency: payment.currency || 'INR',
    planSlug: sku,
    ...metaAttributionFromRequest(request, body, notes),
  }).catch(() => undefined)
  return NextResponse.json({ success: true, entitled: true, purchaseId: result.purchaseId })
}
