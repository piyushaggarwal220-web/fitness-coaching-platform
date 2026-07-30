'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { authenticateClient } from '@/lib/onboarding'
import { createClient } from '@/lib/supabase/client'
import { getCategoryDisplayScores, splitSnapshot, type TrackerSections } from '@/lib/daily-tracker/display'
import { mergeCompletion } from '@/lib/daily-tracker/parser'
import {
  applyTrackerDraft,
  clearTrackerDraft,
  readTrackerDraft,
  writeTrackerDraft,
} from '@/lib/daily-tracker/tracker-draft'
import { ensureAuthSession } from '@/lib/session-restore'
import type {
  DailyTrackerDay,
  TodayTrackerView,
  TrackerCategoryScores,
  TrackerCompletion,
} from '@/lib/daily-tracker/types'

const supabase = createClient()
const FETCH_RETRY_DELAYS_MS = [0, 400, 1000]

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

function withDraft(view: TodayTrackerView): TodayTrackerView {
  const day = view.day
  if (!day) return view
  const draft = readTrackerDraft(day.id)
  if (!draft) return view
  const merged = applyTrackerDraft(day.completion, draft)
  return {
    ...view,
    day: { ...day, completion: merged },
  }
}

async function fetchTodayTracker(): Promise<{
  view: TodayTrackerView | null
  error: string | null
  status: number
}> {
  for (let attempt = 0; attempt < FETCH_RETRY_DELAYS_MS.length; attempt++) {
    if (FETCH_RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAYS_MS[attempt]))
    }

    try {
      if (attempt > 0) {
        await ensureAuthSession(supabase)
      }

      const res = await fetch('/api/tracker/today', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = (await res.json().catch(() => null)) as
        | { view?: TodayTrackerView; error?: string }
        | null

      if (res.ok) {
        return { view: data?.view ?? null, error: null, status: res.status }
      }

      const retryable =
        (res.status === 401 || res.status >= 500) && attempt < FETCH_RETRY_DELAYS_MS.length - 1
      if (retryable) continue

      return {
        view: null,
        error: data?.error ?? 'Failed to load tracker',
        status: res.status,
      }
    } catch {
      if (attempt < FETCH_RETRY_DELAYS_MS.length - 1) continue
      return { view: null, error: 'Failed to load tracker', status: 0 }
    }
  }

  return { view: null, error: 'Failed to load tracker', status: 0 }
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [view, setView] = useState<TodayTrackerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const pendingPatches = useRef<TrackerCompletion[]>([])
  const flushInFlight = useRef(false)
  const dayIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    const result = await authenticateClient(supabase, router, {
      requireOnboarding: true,
      requirePayment: true,
    })
    if (!result) {
      setLoading(false)
      return
    }

    const { view: loaded, error: loadError } = await fetchTodayTracker()
    if (loaded?.day) {
      const withLocal = withDraft(loaded)
      dayIdRef.current = withLocal.day!.id
      setView(withLocal)
      setError(null)
    } else {
      setView(null)
      setError(loadError ?? 'Failed to load tracker')
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) void load()
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [load])

  const day = view?.day ?? null

  const flushPending = useCallback(async () => {
    if (flushInFlight.current) return
    const dayId = dayIdRef.current
    if (!dayId || pendingPatches.current.length === 0) return

    flushInFlight.current = true
    setSaving(true)
    try {
      while (pendingPatches.current.length > 0) {
        const patch = pendingPatches.current[0]
        await ensureAuthSession(supabase)

        let lastError: string | null = null
        let savedDay: DailyTrackerDay | null = null

        for (let attempt = 0; attempt < FETCH_RETRY_DELAYS_MS.length; attempt++) {
          if (FETCH_RETRY_DELAYS_MS[attempt] > 0) {
            await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAYS_MS[attempt]))
          }
          try {
            const res = await fetch('/api/tracker/update', {
              method: 'PATCH',
              credentials: 'include',
              cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dayId, completion: patch }),
            })
            const data = (await res.json().catch(() => null)) as
              | { day?: DailyTrackerDay; error?: string }
              | null

            if (res.ok && data?.day) {
              savedDay = data.day
              lastError = null
              break
            }

            lastError = data?.error ?? 'Failed to save progress'
            const retryable =
              (res.status === 401 || res.status >= 500) &&
              attempt < FETCH_RETRY_DELAYS_MS.length - 1
            if (retryable) {
              await ensureAuthSession(supabase)
              continue
            }
            break
          } catch {
            lastError = 'Failed to save progress'
            if (attempt < FETCH_RETRY_DELAYS_MS.length - 1) continue
            break
          }
        }

        if (!savedDay) {
          setError(lastError ?? 'Failed to save progress')
          break
        }

        pendingPatches.current.shift()
        const draft = readTrackerDraft(dayId)
        setView((current) => {
          if (!current?.day) return current
          // Keep any newer optimistic local changes that haven't flushed yet.
          const localCompletion =
            pendingPatches.current.length > 0 || draft
              ? mergeCompletion(
                  savedDay!.completion,
                  pendingPatches.current.reduce(
                    (acc, p) => mergeCompletion(acc, p),
                    draft?.completion ?? {}
                  )
                )
              : savedDay!.completion

          if (pendingPatches.current.length === 0) {
            clearTrackerDraft(dayId)
          } else {
            writeTrackerDraft(dayId, localCompletion)
          }

          return {
            ...current,
            day: { ...savedDay!, completion: localCompletion },
          }
        })
        setError(null)
      }
    } finally {
      flushInFlight.current = false
      setSaving(pendingPatches.current.length > 0)
    }
  }, [])

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === 'hidden') return
      void (async () => {
        await ensureAuthSession(supabase)
        await flushPending()
      })()
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    window.addEventListener('online', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
      window.removeEventListener('online', onResume)
    }
  }, [flushPending])

  const sections = useMemo(
    () => (day ? splitSnapshot(day.snapshot, day.completion) : null),
    [day]
  )
  const scores = useMemo(() => (day ? getCategoryDisplayScores(day) : null), [day])

  const patchCompletion = useCallback(
    async (patch: TrackerCompletion) => {
      if (!day) return

      // Optimistic local merge so set completions survive app switches even if the
      // network request is still in flight or briefly fails after resume.
      setView((current) => {
        if (!current?.day) return current
        const nextCompletion = mergeCompletion(current.day.completion, patch)
        writeTrackerDraft(current.day.id, nextCompletion)
        return {
          ...current,
          day: { ...current.day, completion: nextCompletion },
        }
      })

      pendingPatches.current.push(patch)
      await flushPending()
    },
    [day, flushPending]
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
