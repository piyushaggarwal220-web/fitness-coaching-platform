'use client'

import { useEffect } from 'react'
import { bindInstallPromptCapture } from '@/lib/pwa-install'

/** Registers the Lurvox service worker + captures Chrome install events early. */
export function PwaRegister() {
  useEffect(() => {
    const unbind = bindInstallPromptCapture()

    if (!('serviceWorker' in navigator)) {
      return () => { unbind() }
    }

    const register = () => {
      void navigator.serviceWorker.register('/notification-sw.js', { scope: '/' }).catch(() => {
        // Ignore registration failures (unsupported / private mode).
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => { unbind() }
  }, [])

  return null
}
