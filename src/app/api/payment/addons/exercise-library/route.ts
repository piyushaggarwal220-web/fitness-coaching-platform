import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { shouldBypassPayment } from '@/lib/config'
import { profileEntitledForExerciseLibrary } from '@/lib/addon-protocols'
import {
  EXERCISE_LIBRARY_ADDON_ID,
  EXERCISE_LIBRARY_ADDON_PAISE,
} from '@/lib/payments/checkout-discounts'
import {
  EXERCISE_LIBRARY_ADDON_KIND,
  fulfillExerciseLibraryAddon,
} from '@/lib/payments/exercise-library-addon'
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  verifyRazorpaySignature,
} from '@/lib/payments/razorpay'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select(
      'id, name, email, phone, payment_confirmed, exercise_library_entitled'
    )
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json(
      { error: 'Start a coaching plan first, then unlock exercise form videos.' },
      { status: 403 }
    )
  }
  if (profileEntitledForExerciseLibrary(profile)) {
    return NextResponse.json({ entitled: true, alreadyUnlocked: true })
  }

  const email = (profile.email || auth.user.email || '').trim().toLowerCase()
  const name = (profile.name || '').trim() || 'Member'
  const phone = (profile.phone || '').trim() || undefined

  if (shouldBypassPayment()) {
    const orderId = `test_exlib_${Date.now()}`
    return NextResponse.json({
      testMode: true,
      orderId,
      amount: EXERCISE_LIBRARY_ADDON_PAISE,
      currency: 'INR',
      keyId: 'test',
      email,
      name,
      phone: phone ?? '',
    })
  }

  try {
    const order = await createRazorpayOrder({
      amountPaise: EXERCISE_LIBRARY_ADDON_PAISE,
      receipt: `exlib_${auth.user.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
      notes: {
        kind: EXERCISE_LIBRARY_ADDON_KIND,
        user_id: auth.user.id,
        customer_email: email,
        customer_name: name,
        customer_phone: phone ?? '',
        addon_ids: EXERCISE_LIBRARY_ADDON_ID,
        addon_total_paise: String(EXERCISE_LIBRARY_ADDON_PAISE),
        amount_paise: '0',
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
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('id, name, email, phone, payment_confirmed, exercise_library_entitled')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json({ error: 'Coaching membership required' }, { status: 403 })
  }

  const email = (profile.email || auth.user.email || '').trim().toLowerCase()
  const name = (profile.name || '').trim() || 'Member'
  const phone = (profile.phone as string | null) ?? null

  if (shouldBypassPayment()) {
    const result = await fulfillExerciseLibraryAddon({
      userId: auth.user.id,
      email,
      name,
      phone,
      razorpayPaymentId: body.razorpay_payment_id || `test_pay_exlib_${Date.now()}`,
      razorpayOrderId: body.razorpay_order_id || `test_order_exlib_${Date.now()}`,
      amountPaise: EXERCISE_LIBRARY_ADDON_PAISE,
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
  if (payment.amount !== EXERCISE_LIBRARY_ADDON_PAISE) {
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 422 })
  }
  const notes = { ...(order.notes ?? {}), ...(payment.notes ?? {}) }
  if (notes.kind !== EXERCISE_LIBRARY_ADDON_KIND || notes.user_id !== auth.user.id) {
    return NextResponse.json({ error: 'This payment is not for your exercise library' }, { status: 403 })
  }

  const result = await fulfillExerciseLibraryAddon({
    userId: auth.user.id,
    email,
    name,
    phone,
    razorpayPaymentId: payment.id,
    razorpayOrderId: order.id,
    amountPaise: payment.amount,
  })
  return NextResponse.json({ success: true, entitled: true, purchaseId: result.purchaseId })
}
