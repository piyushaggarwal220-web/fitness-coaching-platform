import { resolveAuthEmailRedirectOrigin } from '@/lib/admin/portal-urls'

export const PENDING_CHECKOUT_KEY = 'lurvox_checkout_pending'
export const RAZORPAY_CALLBACK_PATH = '/api/payment/razorpay-callback'

export type PendingCheckout = {
  orderId: string
  email: string
  planSlug: string
}

/** Absolute URL Razorpay should POST after a redirect-based payment (UPI, in-app browsers). */
export function razorpayCallbackUrl(planSlug: string): string {
  const origin = resolveAuthEmailRedirectOrigin(
    typeof window === 'undefined' ? null : window.location.origin
  )
  const url = new URL(RAZORPAY_CALLBACK_PATH, origin)
  if (planSlug) url.searchParams.set('plan', planSlug)
  return url.toString()
}

export function rememberPendingCheckout(input: PendingCheckout): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(input))
  } catch {
    // ignore
  }
}

export function readPendingCheckout(): PendingCheckout | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PENDING_CHECKOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingCheckout>
    if (!parsed.orderId || !parsed.email) return null
    return {
      orderId: parsed.orderId,
      email: parsed.email,
      planSlug: parsed.planSlug ?? '',
    }
  } catch {
    return null
  }
}

export function clearPendingCheckout(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PENDING_CHECKOUT_KEY)
  } catch {
    // ignore
  }
}
