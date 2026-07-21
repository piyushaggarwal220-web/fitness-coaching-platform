'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type RealtimeChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

export type RealtimeSubscription = {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  filter?: string
}

type UseRealtimeRefreshOptions = {
  channelName: string
  subscriptions: RealtimeSubscription[]
  onRefresh: () => void | Promise<void>
  onEvent?: (payload: RealtimeChangePayload) => void
  enabled?: boolean
  pollIntervalMs?: number
}

/**
 * Shared Postgres Changes lifecycle: event coalescing, slow polling,
 * focus/online recovery, reconnect refresh, and subscription cleanup.
 */
export function useSupabaseRealtimeRefresh({
  channelName,
  subscriptions,
  onRefresh,
  onEvent,
  enabled = true,
  pollIntervalMs = 60_000,
}: UseRealtimeRefreshOptions) {
  const refreshRef = useRef(onRefresh)
  const eventRef = useRef(onEvent)
  const subscriptionsKey = JSON.stringify(subscriptions)

  useEffect(() => {
    refreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    eventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()
    const configuredSubscriptions = JSON.parse(subscriptionsKey) as RealtimeSubscription[]
    let active = true
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let refreshInFlight = false
    let refreshQueued = false
    let subscribedOnce = false

    const runRefresh = async () => {
      if (!active) return
      if (refreshInFlight) {
        refreshQueued = true
        return
      }

      refreshInFlight = true
      try {
        await refreshRef.current()
      } finally {
        refreshInFlight = false
        if (active && refreshQueued) {
          refreshQueued = false
          requestRefresh()
        }
      }
    }

    const requestRefresh = () => {
      if (!active || refreshTimer) return
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        void runRefresh()
      }, 100)
    }

    let channel = supabase.channel(channelName)
    for (const subscription of configuredSubscriptions) {
      channel = channel.on(
        'postgres_changes',
        {
          event: subscription.event,
          schema: 'public',
          table: subscription.table,
          ...(subscription.filter ? { filter: subscription.filter } : {}),
        },
        (payload) => {
          eventRef.current?.(payload as RealtimeChangePayload)
          requestRefresh()
        }
      )
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (subscribedOnce) requestRefresh()
        subscribedOnce = true
      }
    })

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') requestRefresh()
    }
    const refreshWhenOnline = () => requestRefresh()
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('online', refreshWhenOnline)

    const poll = window.setInterval(requestRefresh, pollIntervalMs)

    return () => {
      active = false
      if (refreshTimer) clearTimeout(refreshTimer)
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('online', refreshWhenOnline)
      void supabase.removeChannel(channel)
    }
  }, [channelName, enabled, pollIntervalMs, subscriptionsKey])
}

export function useChatUnreadCount(viewer: 'client' | 'coach') {
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    let active = true

    const resolveOwner = async () => {
      const supabase = supabaseRef.current
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return

      if (viewer === 'client') {
        setOwnerId(user.id)
        return
      }

      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (active) setOwnerId(coach?.id ?? null)
    }

    void resolveOwner()
    return () => { active = false }
  }, [viewer])

  const refresh = useCallback(async () => {
    if (!ownerId) return
    const unreadColumn = viewer === 'client' ? 'unread_by_client' : 'unread_by_coach'
    const ownerColumn = viewer === 'client' ? 'client_id' : 'coach_id'
    const { data } = await supabaseRef.current
      .from('coach_conversations')
      .select(unreadColumn)
      .eq(ownerColumn, ownerId)
      .neq('status', 'closed')

    const nextCount = (data ?? []).reduce(
      (total, row) => total + Number(row[unreadColumn as keyof typeof row] ?? 0),
      0
    )
    setCount(nextCount)
  }, [ownerId, viewer])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useSupabaseRealtimeRefresh({
    channelName: `chat-unread:${viewer}:${ownerId ?? 'pending'}`,
    subscriptions: ownerId
      ? [{
          event: '*',
          table: 'coach_conversations',
          filter: `${viewer === 'client' ? 'client_id' : 'coach_id'}=eq.${ownerId}`,
        }]
      : [],
    onRefresh: refresh,
    enabled: Boolean(ownerId),
    pollIntervalMs: 60_000,
  })

  return count
}

export function useCoachConversationRealtime(
  coachId: string | null,
  onRefresh: () => void | Promise<void>,
  pollIntervalMs = 60_000,
  scope = 'refresh'
) {
  useSupabaseRealtimeRefresh({
    channelName: `coach-conversations:${scope}:${coachId ?? 'pending'}`,
    subscriptions: coachId
      ? [{
          event: '*',
          table: 'coach_conversations',
          filter: `coach_id=eq.${coachId}`,
        }]
      : [],
    onRefresh,
    enabled: Boolean(coachId),
    pollIntervalMs,
  })
}
