import { metaBrowserIdsForRequest } from '@/lib/analytics/meta-attribution'
import { queueMetaPurchase } from '@/lib/analytics/meta-pixel'
import {
  EXERCISE_VIDEOS_MONTHLY_ID,
  EXERCISE_VIDEOS_MONTHLY_LABEL,
  EXERCISE_VIDEOS_MONTHLY_PAISE,
} from '@/lib/payments/checkout-discounts'

type RazorpayHandlerResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

type RazorpayInstance = { open: () => void }
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

export type ExerciseVideosCheckoutResult =
  | { status: 'success' }
  | { status: 'already_unlocked' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

type OrderResponse = {
  error?: string
  alreadyUnlocked?: boolean
  testMode?: boolean
  orderId?: string
  amount?: number
  currency?: string
  keyId?: string
  email?: string
  name?: string
  phone?: string
}

async function verifyPayment(payload: RazorpayHandlerResponse): Promise<void> {
  const verifyRes = await fetch('/api/payment/addons/exercise-videos', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...metaBrowserIdsForRequest() }),
  })
  const verifyData = (await verifyRes.json().catch(() => null)) as { error?: string } | null
  if (!verifyRes.ok) {
    throw new Error(verifyData?.error ?? 'Payment could not be confirmed')
  }
}

/** Opens Razorpay checkout for 30 days of exercise form videos (₹69). */
export async function startExerciseVideosMonthlyCheckout(): Promise<ExerciseVideosCheckoutResult> {
  const orderRes = await fetch('/api/payment/addons/exercise-videos', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metaBrowserIdsForRequest()),
  })
  const orderData = (await orderRes.json().catch(() => null)) as OrderResponse | null

  if (orderData?.alreadyUnlocked) {
    return { status: 'already_unlocked' }
  }
  if (!orderRes.ok || !orderData?.orderId) {
    return { status: 'error', message: orderData?.error ?? 'Could not start checkout' }
  }

  const finish = async (payload: RazorpayHandlerResponse) => {
    await verifyPayment(payload)
    if (payload.razorpay_payment_id.startsWith('test_')) return
    queueMetaPurchase({
      eventID: `razorpay_${payload.razorpay_payment_id}`,
      value: EXERCISE_VIDEOS_MONTHLY_PAISE / 100,
      currency: 'INR',
      content_name: EXERCISE_VIDEOS_MONTHLY_LABEL,
      content_ids: [EXERCISE_VIDEOS_MONTHLY_ID],
      content_type: 'product',
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  if (orderData.testMode) {
    await finish({
      razorpay_order_id: orderData.orderId,
      razorpay_payment_id: `test_payment_${Date.now()}`,
      razorpay_signature: 'test_signature',
    })
    return { status: 'success' }
  }

  if (!window.Razorpay) {
    return {
      status: 'error',
      message: 'Payment checkout is still loading. Try again in a moment.',
    }
  }

  return new Promise((resolve) => {
    const rzp = new window.Razorpay!({
      key: orderData.keyId,
      amount: orderData.amount ?? EXERCISE_VIDEOS_MONTHLY_PAISE,
      currency: orderData.currency ?? 'INR',
      name: 'LURVOX',
      description: EXERCISE_VIDEOS_MONTHLY_LABEL,
      order_id: orderData.orderId,
      prefill: {
        name: orderData.name,
        email: orderData.email,
        contact: orderData.phone,
      },
      handler: (response: RazorpayHandlerResponse) => {
        void finish(response)
          .then(() => resolve({ status: 'success' }))
          .catch((err: unknown) =>
            resolve({
              status: 'error',
              message: err instanceof Error ? err.message : 'Payment could not be confirmed',
            })
          )
      },
      modal: {
        ondismiss: () => resolve({ status: 'cancelled' }),
      },
    })
    rzp.open()
  })
}
