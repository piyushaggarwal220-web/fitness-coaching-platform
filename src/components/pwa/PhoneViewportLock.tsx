'use client'

import { useEffect } from 'react'
import { applyPhoneViewportLock } from '@/lib/phone-viewport'

/** Re-apply the iPhone desktop-mode viewport lock after bfcache / rotate. */
export function PhoneViewportLock() {
  useEffect(() => {
    applyPhoneViewportLock()
    const onChange = () => applyPhoneViewportLock()
    window.addEventListener('pageshow', onChange)
    window.addEventListener('orientationchange', onChange)
    window.visualViewport?.addEventListener('resize', onChange)
    return () => {
      window.removeEventListener('pageshow', onChange)
      window.removeEventListener('orientationchange', onChange)
      window.visualViewport?.removeEventListener('resize', onChange)
    }
  }, [])
  return null
}
