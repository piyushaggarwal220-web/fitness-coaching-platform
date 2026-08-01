'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
const PATCH_RETRY_DELAYS_MS = [0, 400, 1000]

type TrackerContextValue = {
  view: TodayTrackerView | null
  day: DailyTrackerDay | null
  sections: TrackerSections | null
  scores: (TrackerCategoryScores & { steps: number }) | null
  loading: boolean
  saving: boolean
  error: string | null
  /** Returns true when the patch was accepted by the server. */
  patchCompletion: (patch: TrackerCompletion) => Promise<boolean>
  refresh: () => Promise<void>
  clearError: () => void
}

const TrackerContext = createContext<TrackerContextValue | null>(null)

type PatchQueue = {
  pending: TrackerCompletion | null
  waiters: Array<(ok: boolean) => void>
  flushing: boolean
}

function withDraft(
  view: TodayTrackerView,
  previous?: TodayTrackerView | null
): TodayTrackerView {
  const day = view.day
  if (!day) return view

  const draft = readTrackerDraft(day.id)
  if (!draft) return view

  // Drop local drafts tied to an older plan so a newly delivered plan wins.
  const previousSnapshot = previous?.day?.snapshot
  const nextSnapshot = day.snapshot
  const planChanged =
    previousSnapshot != null &&
    (previousSnapshot.planId !== nextSnapshot.planId ||
      previousSnapshot.planVersion !== nextSnapshot.planVersion ||
      previousSnapshot.planContentSignature !== nextSnapshot.planContentSignature ||
      previousSnapshot.planUpdatedAt !== nextSnapshot.planUpdatedAt)

  if (planChanged) {
    clearTrackerDraft(day.id)
    return view
  }

  // Also ignore drafts that still mention exercise/meal ids absent from the new snapshot.
  const itemIds = new Set(nextSnapshot.items.map((item) => item.id))
  const exerciseIds = new Set(
    nextSnapshot.items.flatMap((item) => {
      if (item.type !== 'workout') return [] as string[]
      const fromPhases =
        item.phases?.flatMap((phase) => phase.exercises.map((exercise) => exercise.id)) ?? []
      const fromRoot = item.exercises?.map((exercise) => exercise.id) ?? []
      return [...fromPhases, ...fromRoot]
    })
  )
  const draftMealIds = Object.keys(draft.completion.meals ?? {})
  const draftExerciseIds = Object.keys(draft.completion.exercises ?? {})
  const draftLooksStale =
    draftMealIds.some((id) => !itemIds.has(id)) ||
    draftExerciseIds.some((id) => !exerciseIds.has(id) && !itemIds.has(id))

  if (draftLooksStale) {
    clearTrackerDraft(day.id)
    return view
  }

  const merged = applyTrackerDraft(day.completion, draft)
  return {
    ...view,
    day: { ...day, completion: merged },
  }
}

async function sendTrackerPatch(
  dayId: string,
  patch: TrackerCompletion
): Promise<{ day: DailyTrackerDay | null; error: string | null; status: number }> {
  for (let attempt = 0; attempt < PATCH_RETRY_DELAYS_MS.length; attempt++) {
    if (PATCH_RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, PATCH_RETRY_DELAYS_MS[attempt]))
    }

    try {
      await ensureAuthSession(supabase)

      const res = await fetch('/api/tracker/update', {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayId, completion: patch }),
      })
      const data = (await res.json().catch(() => null)) as
        | { day?: DailyTrackerDay; error?: string; code?: string }
        | null

      if (res.ok && data?.day) {
        return { day: data.day, error: null, status: res.status }
      }

      const message = data?.error ?? 'Failed to save progress'
      const retryable =
        (res.status === 401 || res.status >= 500) && attempt < PATCH_RETRY_DELAYS_MS.length - 1
      if (retryable) continue

      return { day: null, error: message, status: res.status }
    } catch {
      if (attempt < PATCH_RETRY_DELAYS_MS.length - 1) continue
      return { day: null, error: 'Failed to save progress', status: 0 }
    }
  }

  return { day: null, error: 'Failed to save progress', status: 0 }
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [view, setView] = useState<TodayTrackerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const dayIdRef = useRef<string | null>(null)
  const queueRef = useRef<PatchQueue>({ pending: null, waiters: [], flushing: false })
  const flushQueueRef = useRef<() => Promise<void>>(async () => {})

  useLayoutEffect(() => {
    flushQueueRef.current = async () => {
      const queue = queueRef.current
      if (queue.flushing) return
      queue.flushing = true
      setSaving(true)

      try {
        while (queue.pending) {
          const dayId = dayIdRef.current
          const patch = queue.pending
          const waiters = queue.waiters
          queue.pending = null
          queue.waiters = []

          if (!dayId) {
            waiters.forEach((resolve) => resolve(false))
            setError('Tracker day not ready — reopen Workout Tracker and try again')
            continue
          }

          const result = await sendTrackerPatch(dayId, patch)

          if (result.day) {
            dayIdRef.current = result.day.id
            setView((current) => {
              if (!current) return current
              const nextCompletion = queue.pending
                ? mergeCompletion(result.day!.completion, queue.pending)
                : result.day!.completion

              if (queue.pending) {
                writeTrackerDraft(dayId, nextCompletion)
              } else {
                clearTrackerDraft(dayId)
              }

              return { ...current, day: { ...result.day!, completion: nextCompletion } }
            })
            setError(null)
            waiters.forEach((resolve) => resolve(true))
          } else {
            setError(result.error ?? 'Failed to save progress')
            waiters.forEach((resolve) => resolve(false))
          }
        }
      } finally {
        queue.flushing = false
        setSaving(queue.pending != null || queue.waiters.length > 0)
        if (queue.pending) {
          void flushQueueRef.current()
        }
      }
    }
  })

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
      await ensureAuthSession(supabase)
      const delays = [0, 400, 1000]
      let loaded: TodayTrackerView | null = null
      let loadError: string | null = null

      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]))
        if (attempt > 0) await ensureAuthSession(supabase)

        const res = await fetch('/api/tracker/today', {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = (await res.json().catch(() => null)) as
          | { view?: TodayTrackerView; error?: string }
          | null

        if (res.ok) {
          loaded = data?.view ?? null
          loadError = null
          break
        }

        loadError = data?.error ?? 'Failed to load tracker'
        const retryable =
          (res.status === 401 || res.status >= 500) && attempt < delays.length - 1
        if (!retryable) break
      }

      if (loaded?.day) {
        setView((current) => {
          const withLocal = withDraft(loaded, current)
          dayIdRef.current = withLocal.day!.id
          return withLocal
        })
        setError(null)
      } else {
        dayIdRef.current = null
        setView(null)
        setError(loadError ?? 'Failed to load tracker')
      }
    } catch {
      setError('Failed to load tracker')
      setView(null)
      dayIdRef.current = null
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

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === 'hidden') return
      void (async () => {
        await ensureAuthSession(supabase)
        await flushQueueRef.current()
        // Pull the latest active plan snapshot so newly delivered plans replace stale tracker UI.
        await load()
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
  }, [load])

  const day = view?.day ?? null

  const sections = useMemo(
    () => (day ? splitSnapshot(day.snapshot, day.completion) : null),
    [day]
  )
  const scores = useMemo(() => (day ? getCategoryDisplayScores(day) : null), [day])

  const patchCompletion = useCallback(
    async (patch: TrackerCompletion): Promise<boolean> => {
      const dayId = dayIdRef.current ?? day?.id ?? null
      if (!dayId) return false
      dayIdRef.current = dayId

      // Optimistic local merge + draft so rapid set taps and app switches keep progress.
      setView((current) => {
        if (!current?.day) return current
        const nextCompletion = mergeCompletion(current.day.completion, patch)
        writeTrackerDraft(current.day.id, nextCompletion)
        return {
          ...current,
          day: {
            ...current.day,
            completion: nextCompletion,
          },
        }
      })

      return new Promise<boolean>((resolve) => {
        const queue = queueRef.current
        queue.pending = queue.pending ? mergeCompletion(queue.pending, patch) : patch
        queue.waiters.push(resolve)
        setSaving(true)
        void flushQueueRef.current()
      })
    },
    [day?.id]
  )

  const clearError = useCallback(() => setError(null), [])

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
    clearError,
  }

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
}

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error('useTracker must be used within TrackerProvider')
  return ctx
}
