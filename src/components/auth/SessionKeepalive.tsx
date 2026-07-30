'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensureAuthSession } from '@/lib/session-restore'

const MIN_REFRESH_INTERVAL_MS = 30_000

/**
 * Keeps the Supabase auth session alive when the user leaves the tab/app
 * (music apps, home screen, etc.) and returns. Mobile browsers throttle
 * autoRefreshToken timers while backgrounded, so we refresh on resume.
 */
export function SessionKeepalive() {
  const lastRefreshAt = useRef(0)
  const inFlight = useRef<Promise<void> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const refreshIfNeeded = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      const now = Date.now()
      if (now - lastRefreshAt.current < MIN_REFRESH_INTERVAL_MS) return
      if (inFlight.current) return

      inFlight.current = (async () => {
        try {
          const { user, refreshed } = await ensureAuthSession(supabase)
          if (user) {
            lastRefreshAt.current = Date.now()
            if (refreshed) {
              // Force cookie write path when refresh produced new tokens.
              await supabase.auth.getSession()
            }
          }
        } catch {
          // Ignore — page-level auth guards will retry / redirect if needed.
        } finally {
          inFlight.current = null
        }
      })()
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshIfNeeded()
    }

    refreshIfNeeded()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('online', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [])

  return null
}
