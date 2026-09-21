'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApprovalCard, ChatMsg, JarvisDashboard, TimelineStep } from './types'
import type { CommandView } from './types'

function uid() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function useLayoutMode() {
  const [mode, setMode] = useState<'mobile' | 'tablet' | 'desktop'>('desktop')
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth
      setMode(w < 768 ? 'mobile' : w < 1180 ? 'tablet' : 'desktop')
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])
  return mode
}

export function useJarvisCommand() {
  const [dashboard, setDashboard] = useState<JarvisDashboard | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [conversationTasks, setConversationTasks] = useState<
    { id: string; objective: string; status: string }[]
  >([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState('')
  const [view, setView] = useState<CommandView>('command')
  const [timeline, setTimeline] = useState<TimelineStep[]>([])
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    const res = await fetch('/api/admin/jarvis/dashboard')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load Jarvis')
    setDashboard(json.dashboard)
    return json.dashboard as JarvisDashboard
  }, [])

  const loadMessages = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/jarvis/conversations?conversationId=${id}`)
    const json = await res.json()
    if (json.success) {
      setMessages(json.messages ?? [])
      setConversationTasks(json.tasks ?? [])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadDashboard()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadDashboard])

  const conversations = useMemo(() => {
    const list = dashboard?.conversations ?? []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => c.title.toLowerCase().includes(q))
  }, [dashboard?.conversations, search])

  function upsertTimeline(step: TimelineStep) {
    setTimeline((prev) => {
      const idx = prev.findIndex((s) => s.id === step.id)
      if (idx === -1) {
        return [...prev.map((s) => (s.state === 'active' ? { ...s, state: 'done' as const } : s)), step]
      }
      const next = [...prev]
      next[idx] = { ...next[idx], ...step }
      return next
    })
  }

  async function sendMessage(text?: string) {
    const message = (text ?? input).trim()
    if (!message || busy) return
    setBusy(true)
    setError('')
    setStreamText('')
    setInput('')
    setView('chat')
    setSidebarOpen(false)
    setTimeline([
      { id: 'understand', label: 'Understanding request', state: 'active' },
      { id: 'context', label: 'Checking business context', state: 'pending' },
      { id: 'act', label: 'Working', state: 'pending' },
      { id: 'reply', label: 'Preparing recommendation', state: 'pending' },
    ])
    setTimelineOpen(true)
    setMessages((prev) => [...prev, { id: uid(), role: 'user', content: message }])

    try {
      const res = await fetch('/api/admin/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId, stream: true }),
      })
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Chat failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assembled = ''
      let newConversationId = conversationId

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const payload = JSON.parse(line.slice(5).trim()) as {
            type: string
            message?: string
            text?: string
            tool?: string
            summary?: string
            approval?: ApprovalCard
            error?: string
            conversationId?: string
            daily_spent_usd?: number
            daily_limit_usd?: number
          }
          if (payload.type === 'status' && payload.message) {
            const msg = payload.message
            if (msg.toLowerCase().includes('context')) {
              upsertTimeline({ id: 'understand', label: 'Understanding request', state: 'done' })
              upsertTimeline({ id: 'context', label: 'Checking business context', state: 'active' })
            } else if (msg.toLowerCase().includes('preparing') || msg.toLowerCase().includes('compos')) {
              upsertTimeline({ id: 'act', label: 'Working', state: 'done' })
              upsertTimeline({ id: 'reply', label: 'Preparing recommendation', state: 'active' })
            } else if (msg.toLowerCase().includes('understand') || msg.toLowerCase().includes('thinking')) {
              upsertTimeline({ id: 'understand', label: 'Understanding request', state: 'active' })
            } else {
              upsertTimeline({
                id: `s-${msg.slice(0, 24)}`,
                label: msg.replace(/\.\.\.$/, ''),
                state: 'active',
                detail: msg,
              })
            }
          }
          if (payload.type === 'tool_start' && payload.tool) {
            upsertTimeline({ id: 'context', label: 'Checking business context', state: 'done' })
            upsertTimeline({
              id: `tool-${payload.tool}`,
              label: payload.tool,
              state: 'active',
            })
          }
          if (payload.type === 'tool_result' && payload.tool) {
            upsertTimeline({
              id: `tool-${payload.tool}`,
              label: payload.tool,
              state: payload.summary?.toLowerCase().includes('fail') ? 'error' : 'done',
              detail: payload.summary,
            })
          }
          if (payload.type === 'token' && payload.text) {
            assembled += payload.text
            setStreamText(assembled)
          }
          if (payload.type === 'approval' && payload.approval) {
            setDashboard((d) =>
              d ? { ...d, approvals: [payload.approval!, ...(d.approvals ?? [])] } : d
            )
          }
          if (payload.type === 'error') setError(payload.error || 'Error')
          if (payload.type === 'done' && payload.conversationId) {
            newConversationId = payload.conversationId
            setConversationId(payload.conversationId)
            setTimeline([])
            setTimelineOpen(false)
          }
          if (payload.type === 'cost') {
            setDashboard((d) =>
              d
                ? {
                    ...d,
                    cost: {
                      ...(d.cost ?? {}),
                      daily_spent_usd: payload.daily_spent_usd,
                      daily_limit_usd: payload.daily_limit_usd,
                    },
                  }
                : d
            )
          }
        }
      }

      if (newConversationId) await loadMessages(newConversationId)
      else if (assembled) {
        setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: assembled }])
      }
      setStreamText('')
      await loadDashboard()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
      upsertTimeline({ id: 'error', label: 'Stopped', state: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function startNewConversation() {
    setConversationId(null)
    setMessages([])
    setConversationTasks([])
    setStreamText('')
    setTimeline([])
    setError('')
    setView('chat')
    setSidebarOpen(false)
  }

  async function openConversation(id: string) {
    setConversationId(id)
    setStreamText('')
    setTimeline([])
    setView('chat')
    setSidebarOpen(false)
    await loadMessages(id)
  }

  async function decide(approvalId: string, approve: boolean) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/jarvis/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, approve }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Approval failed')
      await loadDashboard()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed')
    } finally {
      setBusy(false)
    }
  }

  const pendingApprovals = dashboard?.approvals ?? []
  const activeTask = conversationTasks[0] ?? dashboard?.tasks?.[0] ?? null

  return {
    dashboard,
    conversationId,
    messages,
    conversationTasks,
    input,
    setInput,
    busy,
    streamText,
    error,
    setError,
    view,
    setView,
    timeline,
    timelineOpen,
    setTimelineOpen,
    search,
    setSearch,
    conversations,
    sidebarOpen,
    setSidebarOpen,
    railOpen,
    setRailOpen,
    selectedTaskId,
    setSelectedTaskId,
    sendMessage,
    startNewConversation,
    openConversation,
    decide,
    loadDashboard,
    pendingApprovals,
    activeTask,
  }
}

export type JarvisCommandState = ReturnType<typeof useJarvisCommand>
