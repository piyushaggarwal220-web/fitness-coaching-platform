'use client'

import { useEffect, useState } from 'react'
import { isPublicDemoEmail } from '@/lib/public-demo'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

/** True when the signed-in browser session is the public view-only demo client. */
export function usePublicDemo(): boolean {
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    let active = true
    void supabase.auth.getUser().then((result) => {
      if (active) setIsDemo(isPublicDemoEmail(result.data.user?.email))
    })
    return () => {
      active = false
    }
  }, [])

  return isDemo
}
