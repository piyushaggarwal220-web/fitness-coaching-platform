'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensureAuthSession } from '@/lib/session-restore'

const MIN_REFRESH_INTERVAL_MS = 30_000
/** Proactive refresh while the tab stays open (JWT often ~1h). */
const PROACTIVE_REFRESH_MS = 45 * 60_000

/**
 * Keeps the Supabase auth session alive when the user leaves the tab/app
 * (music apps, home screen, etc.) and returns. Mobile browsers throttle
 * autoRefreshToken timers while backgrounded, so we refresh on resume.
 *
 * Ops (required for ~30-day stay logged in): Supabase Dashboard → project
 * `zhcedsmvpvpaqezbdiiy` → Authentication → Sessions —
 * disable or raise session time-box; set inactivity timeout ≥ 30 days;
 * leave JWT expiry ~1 hour. App cookies already persist far longer; daily
 * logout is almost always the dashboard session policy, not Next.js maxAge.
 * Never call signOut from this component.
 */
export function SessionKeepalive() {
  const lastRefreshAt = useRef(0)
  const inFlight = useRef<Promise<void> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const refreshIfNeeded = (force = false) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      const now = Date.now()
      if (!force && now - lastRefreshAt.current < MIN_REFRESH_INTERVAL_MS) return
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
          // Intentionally do not signOut on failed refresh — guards redirect later.
        } catch {
          // Ignore — page-level auth guards will retry / redirect if needed.
        } finally {
          inFlight.current = null
        }
      })()
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshIfNeeded(true)
    }

    refreshIfNeeded(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('online', onVisible)

    const proactive = window.setInterval(() => refreshIfNeeded(true), PROACTIVE_REFRESH_MS)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        lastRefreshAt.current = Date.now()
      }
      // Never react to SIGNED_OUT here — avoid cascading logout loops.
    })

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('online', onVisible)
      window.clearInterval(proactive)
      subscription.unsubscribe()
    }
  }, [])

  return null
}
