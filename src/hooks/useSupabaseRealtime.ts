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
  presence?: {
    key: string
    payload: Record<string, string>
    onSync: (presences: Record<string, unknown[]>) => void
    heartbeat?: () => void | Promise<void>
  }
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
  presence,
}: UseRealtimeRefreshOptions) {
  const refreshRef = useRef(onRefresh)
  const eventRef = useRef(onEvent)
  const subscriptionsKey = JSON.stringify(subscriptions)
  const presenceRef = useRef(presence)

  useEffect(() => {
    refreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    eventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    presenceRef.current = presence
  }, [presence])

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

    const configuredPresence = presenceRef.current
    let channel = supabase.channel(
      channelName,
      configuredPresence
        ? { config: { private: true, presence: { key: configuredPresence.key } } }
        : undefined
    )
    if (configuredPresence) {
      channel = channel.on('presence', { event: 'sync' }, () => {
        presenceRef.current?.onSync(channel.presenceState() as Record<string, unknown[]>)
      })
    }
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
        if (configuredPresence) {
          void channel.track(configuredPresence.payload)
          void configuredPresence.heartbeat?.()
        }
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
    const heartbeat = configuredPresence
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') void configuredPresence.heartbeat?.()
        }, 60_000)
      : null

    return () => {
      active = false
      if (refreshTimer) clearTimeout(refreshTimer)
      window.clearInterval(poll)
      if (heartbeat) window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('online', refreshWhenOnline)
      if (configuredPresence) void channel.untrack()
      void supabase.removeChannel(channel)
    }
  }, [channelName, enabled, pollIntervalMs, subscriptionsKey])
}

export function useChatUnreadCount(viewer: 'client' | 'coach', enabled = true) {
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (!enabled) return
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
  }, [viewer, enabled])

  const refresh = useCallback(async () => {
    if (!enabled || !ownerId) return
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
  }, [enabled, ownerId, viewer])

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
    enabled: enabled && Boolean(ownerId),
    pollIntervalMs: 90_000,
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
        }, {
          event: '*',
          table: 'call_requests',
          filter: `coach_id=eq.${coachId}`,
        }, {
          event: '*',
          table: 'initial_plan_generation_jobs',
          filter: `coach_id=eq.${coachId}`,
        }]
      : [],
    onRefresh,
    enabled: Boolean(coachId),
    pollIntervalMs,
  })
}
