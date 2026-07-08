'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/roles'

const supabase = createClient()

export function useAdminRole(): { role: UserRole | null; loading: boolean } {
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return

      if (!user) {
        setRole(null)
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return
      setRole((profile?.role as UserRole | null) ?? null)
      setLoading(false)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return { role, loading }
}

