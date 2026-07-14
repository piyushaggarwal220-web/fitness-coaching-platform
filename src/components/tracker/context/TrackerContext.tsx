'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { authenticateClient } from '@/lib/onboarding'
import { createClient } from '@/lib/supabase/client'
import { getCategoryDisplayScores, splitSnapshot, type TrackerSections } from '@/lib/daily-tracker/display'
import type {
  DailyTrackerDay,
  TodayTrackerView,
  TrackerCategoryScores,
  TrackerCompletion,
} from '@/lib/daily-tracker/types'

const supabase = createClient()

type TrackerContextValue = {
  view: TodayTrackerView | null
  day: DailyTrackerDay | null
  sections: TrackerSections | null
  scores: (TrackerCategoryScores & { steps: number }) | null
  loading: boolean
  saving: boolean
  error: string | null
  patchCompletion: (patch: TrackerCompletion) => Promise<void>
  refresh: () => Promise<void>
}

const TrackerContext = createContext<TrackerContextValue | null>(null)

export function TrackerProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [view, setView] = useState<TodayTrackerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
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
        setView(null)
      } else {
        setView(data.view ?? null)
        setError(null)
      }
    } catch {
      setError('Failed to load tracker')
      setView(null)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const day = view?.day ?? null

  const sections = useMemo(() => (day ? splitSnapshot(day.snapshot) : null), [day])
  const scores = useMemo(() => (day ? getCategoryDisplayScores(day) : null), [day])

  const patchCompletion = useCallback(
    async (patch: TrackerCompletion) => {
      if (!day) return
      setSaving(true)
      try {
        const res = await fetch('/api/tracker/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayId: day.id, completion: patch }),
        })
        const data = (await res.json()) as { day?: DailyTrackerDay; error?: string }
        if (!res.ok || !data.day) {
          setError(data.error ?? 'Failed to save progress')
          return
        }
        setView((current) => (current ? { ...current, day: data.day! } : current))
      } finally {
        setSaving(false)
      }
    },
    [day]
  )

  const value: TrackerContextValue = {
    view,
    day,
    sections,
    scores,
    loading,
    saving,
    error,
    patchCompletion,
    refresh: load,
  }

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
}

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error('useTracker must be used within TrackerProvider')
  return ctx
}
