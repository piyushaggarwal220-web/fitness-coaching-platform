'use client'

import { useEffect } from 'react'

/** Registers the Lurvox service worker for PWA install + offline shell + push. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const register = () => {
      void navigator.serviceWorker.register('/notification-sw.js', { scope: '/' }).catch(() => {
        // Ignore registration failures (unsupported / private mode).
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
