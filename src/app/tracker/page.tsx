'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DailyTrackerClient } from '@/components/tracker/DailyTrackerClient'
import { authenticateClient } from '@/lib/onboarding'
import { createClient } from '@/lib/supabase/client'
import type { TodayTrackerView } from '@/lib/daily-tracker/types'

const supabase = createClient()

export default function TrackerPage() {
  const router = useRouter()
  const [view, setView] = useState<TodayTrackerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const result = await authenticateClient(supabase, router, {
        requireOnboarding: true,
        requirePayment: true,
      })
      if (!result) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/tracker/today')
        const data = (await res.json()) as { view?: TodayTrackerView; error?: string }
        if (!res.ok) {
          setError(data.error ?? 'Failed to load tracker')
        } else {
          setView(data.view ?? null)
        }
      } catch {
        setError('Failed to load tracker')
      }
      setLoading(false)
    }
    void load()
  }, [router])

  if (loading) {
    return <DailyTrackerClient initialView={null} initialError={null} />
  }

  return <DailyTrackerClient initialView={view} initialError={error} />
}
