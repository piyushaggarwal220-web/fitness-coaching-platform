'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { readApiJson } from '@/lib/api-response'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import type { CoachConversationListItem } from '@/lib/coach-chat'
import { useCoachConversationRealtime } from '@/hooks/useSupabaseRealtime'

const supabase = createClient()

type UseCoachConversationListOptions = {
  realtimeScope: string
  pollIntervalMs?: number
}

export function useCoachConversationList({
  realtimeScope,
  pollIntervalMs = 60_000,
}: UseCoachConversationListOptions) {
  const router = useRouter()
  const [conversations, setConversations] = useState<CoachConversationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [authRetryKey, setAuthRetryKey] = useState(0)

  const fetchConversations = useCallback(async (options?: { showLoading?: boolean }) => {
    if (!coachId) return

    if (options?.showLoading) setLoading(true)

    const response = await fetch('/api/chat/coach-conversations', {
      credentials: 'include',
      cache: 'no-store',
    })
    const result = await readApiJson<{
      conversations?: CoachConversationListItem[]
      coachId?: string
    }>(response)

    if (!result.ok) {
      setError(result.error)
      setConversations([])
      setLoading(false)
      return
    }

    setError('')
    setConversations(result.data.conversations ?? [])
    if (result.data.coachId) setCoachId(result.data.coachId)
    setLoading(false)
  }, [coachId])

  useEffect(() => {
    let active = true
    const authorize = async () => {
      setError('')
      setLoading(true)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const coach = await requireCoach(supabase, router)
        if (!active) return
        if (coach) {
          setCoachId(coach.id)
          return
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        }
      }
      if (!active) return
      setError('Could not restore your coach session. Please refresh or sign in again.')
      setLoading(false)
    }
    void authorize()
    return () => {
      active = false
    }
  }, [router, authRetryKey])

  useEffect(() => {
    void fetchConversations()
  }, [fetchConversations])

  useCoachConversationRealtime(
    coachId,
    () => fetchConversations(),
    pollIntervalMs,
    realtimeScope
  )

  const retry = useCallback(() => {
    setConversations([])
    setCoachId(null)
    setError('')
    setLoading(true)
    setAuthRetryKey((value) => value + 1)
  }, [])

  const reload = useCallback(() => {
    if (!coachId) {
      retry()
      return
    }
    void fetchConversations({ showLoading: true })
  }, [coachId, fetchConversations, retry])

  return {
    conversations,
    loading,
    coachId,
    error,
    reload,
    retry,
  }
}
