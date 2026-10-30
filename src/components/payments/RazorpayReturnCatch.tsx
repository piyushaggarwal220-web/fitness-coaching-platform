'use client'

import { useEffect } from 'react'
import {
  clearPendingCheckout,
  RAZORPAY_CALLBACK_PATH,
  readPendingCheckout,
} from '@/lib/payments/razorpay-return'

const SETUP_PATHS = ['/create-account', '/onboarding', '/login']

/**
 * UPI and in-app browsers leave checkout and come back to the pay page.
 * If Razorpay appended the payment ids, forward them to the callback.
 * If the page just reloaded, confirm the saved order and continue to account setup.
 */
export function RazorpayReturnCatch() {
  useEffect(() => {
    const path = window.location.pathname
    if (path === RAZORPAY_CALLBACK_PATH) return

    const params = new URLSearchParams(window.location.search)
    const paymentId = params.get('razorpay_payment_id')?.trim() ?? ''
    const orderId = params.get('razorpay_order_id')?.trim() ?? ''
    const signature = params.get('razorpay_signature')?.trim() ?? ''
    if (paymentId && orderId && signature) {
      const next = new URL(RAZORPAY_CALLBACK_PATH, window.location.origin)
      next.searchParams.set('razorpay_payment_id', paymentId)
      next.searchParams.set('razorpay_order_id', orderId)
      next.searchParams.set('razorpay_signature', signature)
      const plan = params.get('plan')?.trim()
      if (plan) next.searchParams.set('plan', plan)
      window.location.replace(next.toString())
      return
    }

    if (SETUP_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      clearPendingCheckout()
      return
    }

    const pending = readPendingCheckout()
    if (!pending) return

    const clearIfSameOrder = () => {
      if (readPendingCheckout()?.orderId === pending.orderId) clearPendingCheckout()
    }

    let cancelled = false
    const run = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (cancelled) return
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000))
        try {
          const res = await fetch('/api/payment/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: pending.orderId, email: pending.email }),
          })
          const data = (await res.json().catch(() => null)) as {
            redirectTo?: string
            pending?: boolean
          } | null
          if (cancelled) return
          if (data?.redirectTo) {
            clearIfSameOrder()
            window.location.replace(data.redirectTo)
            return
          }
          if (!data?.pending) break
        } catch {
          // Try again while the bank is still posting the capture.
        }
      }
      if (!cancelled) clearIfSameOrder()
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return null
}
