import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { shouldBypassPayment } from '@/lib/config'
import { loadExerciseVideoAccess } from '@/lib/exercise-form/access-server'
import { publicExerciseVideoAccess } from '@/lib/exercise-form/access'
import {
  EXERCISE_VIDEOS_MONTHLY_ID,
  EXERCISE_VIDEOS_MONTHLY_LABEL,
  EXERCISE_VIDEOS_MONTHLY_PAISE,
} from '@/lib/payments/checkout-discounts'
import {
  EXERCISE_VIDEOS_MONTHLY_KIND,
  EXERCISE_VIDEOS_MONTHLY_PLAN_SLUG,
  fulfillExerciseVideosMonthly,
} from '@/lib/payments/exercise-videos-monthly'
import { sendMetaPurchase } from '@/lib/analytics/meta-conversions'
import { metaAttributionFromRequest, razorpayMetaNotes } from '@/lib/analytics/meta-attribution'
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  verifyRazorpaySignature,
} from '@/lib/payments/razorpay'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  try {
    const access = await loadExerciseVideoAccess({ userId: auth.user.id })
    return NextResponse.json({ success: true, ...publicExerciseVideoAccess(access) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not check video access'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  let body: { meta_fbp?: string; meta_fbc?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('id, name, email, phone, payment_confirmed, exercise_library_entitled')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json(
      { error: 'Start a plan first, then unlock exercise form videos.' },
      { status: 403 }
    )
  }

  const access = await loadExerciseVideoAccess({
    userId: auth.user.id,
    lifetimeLibrary: profile.exercise_library_entitled === true,
  })
  if (access.allowed) {
    return NextResponse.json({
      alreadyUnlocked: true,
      ...publicExerciseVideoAccess(access),
    })
  }

  const email = (profile.email || auth.user.email || '').trim().toLowerCase()
  const name = (profile.name || '').trim() || 'Member'
  const phone = (profile.phone || '').trim() || undefined

  if (shouldBypassPayment()) {
    const orderId = `test_exvid_${Date.now()}`
    return NextResponse.json({
      testMode: true,
      orderId,
      amount: EXERCISE_VIDEOS_MONTHLY_PAISE,
      currency: 'INR',
      keyId: 'test',
      email,
      name,
      phone: phone ?? '',
    })
  }

  try {
    const order = await createRazorpayOrder({
      amountPaise: EXERCISE_VIDEOS_MONTHLY_PAISE,
      receipt: `exvid_${auth.user.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
      notes: {
        kind: EXERCISE_VIDEOS_MONTHLY_KIND,
        user_id: auth.user.id,
        customer_email: email,
        customer_name: name,
        customer_phone: phone ?? '',
        addon_ids: EXERCISE_VIDEOS_MONTHLY_ID,
        addon_total_paise: String(EXERCISE_VIDEOS_MONTHLY_PAISE),
        amount_paise: '0',
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
    meta_fbp?: string
    meta_fbc?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('id, name, email, phone, payment_confirmed')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json({ error: 'A paid plan is required' }, { status: 403 })
  }

  const email = (profile.email || auth.user.email || '').trim().toLowerCase()
  const name = (profile.name || '').trim() || 'Member'
  const phone = (profile.phone as string | null) ?? null

  if (shouldBypassPayment()) {
    const result = await fulfillExerciseVideosMonthly({
      userId: auth.user.id,
      email,
      name,
      phone,
      razorpayPaymentId: body.razorpay_payment_id || `test_pay_exvid_${Date.now()}`,
      razorpayOrderId: body.razorpay_order_id || `test_order_exvid_${Date.now()}`,
      amountPaise: EXERCISE_VIDEOS_MONTHLY_PAISE,
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
  if (payment.amount !== EXERCISE_VIDEOS_MONTHLY_PAISE) {
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 422 })
  }
  const notes = { ...(order.notes ?? {}), ...(payment.notes ?? {}) }
  if (notes.kind !== EXERCISE_VIDEOS_MONTHLY_KIND || notes.user_id !== auth.user.id) {
    return NextResponse.json({ error: 'This payment is not for your exercise videos' }, { status: 403 })
  }

  const result = await fulfillExerciseVideosMonthly({
    userId: auth.user.id,
    email,
    name,
    phone,
    razorpayPaymentId: payment.id,
    razorpayOrderId: order.id,
    amountPaise: payment.amount,
  })
  await sendMetaPurchase({
    purchaseId: result.purchaseId,
    paymentId: payment.id,
    email,
    phone,
    amountPaise: payment.amount,
    currency: payment.currency || 'INR',
    planSlug: EXERCISE_VIDEOS_MONTHLY_PLAN_SLUG,
    contentName: EXERCISE_VIDEOS_MONTHLY_LABEL,
    eventSourcePath: '/library/unlock',
    ...metaAttributionFromRequest(request, body, notes),
  }).catch(() => undefined)
  return NextResponse.json({ success: true, entitled: true, purchaseId: result.purchaseId })
}
