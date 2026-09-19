import { metaBrowserIdsForRequest } from '@/lib/analytics/meta-attribution'
import { queueMetaPurchase } from '@/lib/analytics/meta-pixel'
import {
  PLATFORM_UNLOCK_META,
  type PlatformUnlockSku,
} from '@/lib/payments/platform-unlock-catalog'

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

export type PlatformUnlockCheckoutResult =
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

async function verifyPayment(
  sku: PlatformUnlockSku,
  payload: RazorpayHandlerResponse
): Promise<void> {
  const verifyRes = await fetch('/api/payment/addons/platform-unlock', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, sku, ...metaBrowserIdsForRequest() }),
  })
  const verifyData = (await verifyRes.json().catch(() => null)) as { error?: string } | null
  if (!verifyRes.ok) {
    throw new Error(verifyData?.error ?? 'Payment could not be confirmed')
  }
}

/** Opens Razorpay for Instant platform feature unlocks (₹99 / ₹199). */
export async function startPlatformUnlockCheckout(
  sku: PlatformUnlockSku
): Promise<PlatformUnlockCheckoutResult> {
  const orderRes = await fetch('/api/payment/addons/platform-unlock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, ...metaBrowserIdsForRequest() }),
  })
  const orderData = (await orderRes.json().catch(() => null)) as OrderResponse | null

  if (orderData?.alreadyUnlocked) {
    return { status: 'already_unlocked' }
  }
  if (!orderRes.ok || !orderData?.orderId) {
    return { status: 'error', message: orderData?.error ?? 'Could not start checkout' }
  }

  const finish = async (payload: RazorpayHandlerResponse) => {
    await verifyPayment(sku, payload)
    if (payload.razorpay_payment_id.startsWith('test_')) return
    queueMetaPurchase({
      eventID: `razorpay_${payload.razorpay_payment_id}`,
      value: PLATFORM_UNLOCK_META[sku].amountPaise / 100,
      currency: 'INR',
      content_name: PLATFORM_UNLOCK_META[sku].label,
      content_ids: [sku],
      content_type: 'product',
    })
    // Give the pixel beacon a moment before any UI state change.
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
    return { status: 'error', message: 'Payment form is still loading. Try again in a moment.' }
  }

  const meta = PLATFORM_UNLOCK_META[sku]

  return await new Promise<PlatformUnlockCheckoutResult>((resolve) => {
    const rzp = new window.Razorpay!({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'Lurvox',
      description: meta.label,
      order_id: orderData.orderId,
      prefill: {
        name: orderData.name || '',
        email: orderData.email || '',
        contact: orderData.phone || '',
      },
      handler: (response: RazorpayHandlerResponse) => {
        void finish(response)
          .then(() => resolve({ status: 'success' }))
          .catch((err) =>
            resolve({
              status: 'error',
              message: err instanceof Error ? err.message : 'Payment confirmation failed',
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
