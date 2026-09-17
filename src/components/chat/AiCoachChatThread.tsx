'use client'

import { useEffect, useRef, useState } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'

type Msg = { id?: string; role: 'user' | 'assistant'; content: string; created_at?: string }

export function AiCoachChatThread() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/client/ai-chat', { credentials: 'include', cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          if (!active) return
          setError(data?.error ?? 'Could not load chat')
          setLoading(false)
          return
        }
        if (!active) return
        setMessages((data?.messages as Msg[]) ?? [])
        setLoading(false)
      } catch {
        if (!active) return
        setError('Could not load chat')
        setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    setDraft('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    try {
      const res = await fetch('/api/client/ai-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Could not send')
        setSending(false)
        return
      }
      if (data?.message) {
        setMessages((prev) => [...prev, data.message as Msg])
      }
    } catch {
      setError('Could not send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: spacing[4], display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>Loading your AI coach…</p>
        )}
        {!loading && messages.length === 0 && (
          <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
            Ask about your plan, meals, workouts, or what to do today. Your coach matches the styles you
            picked in onboarding.
          </p>
        )}
        {messages.map((msg, index) => {
          const mine = msg.role === 'user'
          return (
            <div
              key={msg.id ?? `${msg.role}-${index}`}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                padding: '10px 12px',
                borderRadius: radius.md,
                background: mine ? colors.accent : colors.bgElevated,
                color: mine ? colors.textInverse : colors.textPrimary,
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.content}
            </div>
          )
        })}
        {sending && (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>Coach is typing…</p>
        )}
        <div ref={bottomRef} />
      </div>
      {error && (
        <p style={{ margin: `0 ${spacing[4]}px ${spacing[2]}px`, color: colors.danger, fontSize: 13 }}>
          {error}
        </p>
      )}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: spacing[3],
          borderTop: `1px solid ${colors.divider}`,
          background: colors.bgGlass,
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Message your AI coach…"
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: radius.sm,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgCard,
            color: colors.textPrimary,
            padding: '0 12px',
            fontSize: 15,
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          style={{
            minHeight: 44,
            padding: '0 16px',
            borderRadius: radius.sm,
            border: 'none',
            background: colors.accent,
            color: colors.textInverse,
            fontWeight: 700,
            cursor: sending ? 'wait' : 'pointer',
            opacity: sending || !draft.trim() ? 0.6 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
