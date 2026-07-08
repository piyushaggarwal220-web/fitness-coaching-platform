'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireAdmin, type AdminProfile } from '@/lib/admin-session'

const supabase = createClient()

export type AdminGuardState = {
  admin: AdminProfile | null
  loading: boolean
  denied: boolean
}

/**
 * Ensures admin pages always leave the loading state — even when auth redirects.
 * Prevents infinite "Loading…" spinners when the session is missing or not an admin.
 */
export function useAdminGuard(): AdminGuardState {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const result = await requireAdmin(supabase, router)
      if (cancelled) return

      if (!result) {
        setDenied(true)
        setAdmin(null)
      } else {
        setAdmin(result)
        setDenied(false)
      }
      setLoading(false)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [router])

  return { admin, loading, denied }
}
