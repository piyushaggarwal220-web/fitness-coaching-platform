'use client'

import { useEffect } from 'react'
import { flushPendingMetaPurchase } from '@/lib/analytics/meta-pixel'

/** Retries queued Purchase after checkout redirect until fbq is ready. */
export function PendingMetaPurchaseFlush() {
  useEffect(() => {
    if (flushPendingMetaPurchase()) return

    let attempts = 0
    const maxAttempts = 40
    const timer = window.setInterval(() => {
      attempts += 1
      if (flushPendingMetaPurchase() || attempts >= maxAttempts) {
        window.clearInterval(timer)
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [])

  return null
}
