'use client'

import { useEffect, useState } from 'react'
import { colors } from '@/lib/coach-theme'
import type { ConversationMessage } from '@/types/database'

export function CoachChatAssistPanel({
  conversationId,
  messages,
}: {
  conversationId: string
  messages: ConversationMessage[]
}) {
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState('')
  const latestClientMessageId = [...messages].reverse().find((message) => message.sender_type === 'client')?.id ?? ''

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/coach/chat-assist?conversationId=${encodeURIComponent(conversationId)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => null)) as { success?: boolean; summary?: string; error?: string } | null
        if (!active) return
        if (!res.ok || !json?.success || !json.summary) {
          setError(json?.error || 'Summary could not be loaded.')
          return
        }
        setSummary(json.summary)
      } catch {
        if (active) setError('Summary could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [conversationId, latestClientMessageId])

  const publish = async () => {
    setPublishing(true)
    setNotice('')
    setError('')
    try {
      const res = await fetch('/api/coach/chat-assist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; updated?: boolean; summary?: string; error?: string }
        | null
      if (!res.ok || !json?.success) {
        setError(json?.error || 'The plan was not updated.')
        return
      }
      if (json.summary) setSummary(json.summary)
      setNotice(json.updated ? 'The live plan is updated. The client sees it as your plan.' : 'Nothing in the chat asked for a plan change.')
    } catch {
      setError('The plan was not updated.')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <aside
      style={{
        flexShrink: 0,
        maxHeight: 220,
        overflow: 'auto',
        marginBottom: 12,
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.bgElevated,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textMuted }}>
        For you only
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: colors.textPrimary }}>
        {loading && !summary ? 'Reading what they said…' : summary || 'No summary yet.'}
      </p>
      {error ? <p style={{ margin: '8px 0 0', fontSize: 13, color: '#9f1239' }}>{error}</p> : null}
      {notice ? <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.textSecondary }}>{notice}</p> : null}
      <button
        type="button"
        onClick={() => void publish()}
        disabled={publishing}
        style={{
          marginTop: 10,
          minHeight: 36,
          padding: '0 12px',
          borderRadius: 8,
          border: `1px solid ${colors.accent}`,
          background: colors.accentMuted,
          color: colors.accent,
          fontWeight: 700,
          fontSize: 13,
          cursor: publishing ? 'wait' : 'pointer',
        }}
      >
        {publishing ? 'Updating the plan…' : 'Update the plan from this chat'}
      </button>
    </aside>
  )
}
