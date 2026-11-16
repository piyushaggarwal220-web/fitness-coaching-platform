'use client'

import { useEffect, useMemo, useState } from 'react'
import { colors } from '@/lib/coach-theme'
import type { ConversationMessage } from '@/types/database'

function messagePreview(message: ConversationMessage): string {
  const text = message.content?.replace(/\s+/g, ' ').trim() ?? ''
  if (text) return text.length > 140 ? `${text.slice(0, 140).trimEnd()}…` : text
  if (message.message_type === 'image') return 'Photo'
  if (message.message_type === 'voice') return 'Voice message'
  return 'Attachment'
}

function senderLabel(message: ConversationMessage): string {
  if (message.sender_type === 'client') return 'Client'
  if (message.sender_type === 'coach') return 'You'
  return 'Note'
}

const fieldStyle = {
  display: 'block' as const,
  width: '100%',
  boxSizing: 'border-box' as const,
  marginTop: 6,
  padding: 8,
  borderRadius: 8,
  border: `1px solid ${colors.borderSubtle}`,
  background: colors.bgCard,
  color: colors.textPrimary,
  font: 'inherit',
  fontSize: 14,
  lineHeight: 1.45,
  resize: 'vertical' as const,
}

export function CoachChatAssistPanel({
  conversationId,
  messages,
}: {
  conversationId: string
  messages: ConversationMessage[]
}) {
  const [thread, setThread] = useState<ConversationMessage[]>(messages)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [comment, setComment] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [notice, setNotice] = useState('')
  const latestClientMessageId = [...thread].reverse().find((message) => message.sender_type === 'client')?.id ?? ''

  useEffect(() => {
    setThread(messages)
    setSelected(new Set())
    setComment('')
    setQuestion('')
    setAnswer('')
    setNotice('')
  }, [conversationId, messages])

  useEffect(() => {
    let active = true
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/chat/messages?conversationId=${encodeURIComponent(conversationId)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => null)) as { messages?: ConversationMessage[] } | null
        if (!active || !res.ok || !json?.messages) return
        setThread(json.messages)
        setSelected((current) => {
          const ids = new Set(json.messages?.map((message) => message.id))
          return new Set([...current].filter((id) => ids.has(id)))
        })
      } catch {
        // The list from the page stays usable if a refresh fails.
      }
    }
    void loadMessages()
    return () => {
      active = false
    }
  }, [conversationId, latestClientMessageId])

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

  const selectable = useMemo(
    () => thread.filter((message) => message.content?.trim() || message.media_url),
    [thread]
  )

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const publish = async () => {
    const coachComment = comment.trim()
    if (selected.size === 0 && !coachComment) {
      setError('Select the messages to use, or write a comment.')
      return
    }
    setPublishing(true)
    setNotice('')
    setError('')
    try {
      const res = await fetch('/api/coach/chat-assist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'update_plan',
          conversationId,
          messageIds: [...selected],
          coachComment,
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; updated?: boolean; summary?: string; error?: string }
        | null
      if (!res.ok || !json?.success) {
        setError(json?.error || 'The plan was not updated.')
        return
      }
      if (json.summary) setSummary(json.summary)
      setNotice(
        json.updated
          ? 'The live plan is updated from the messages you picked and your comments.'
          : 'Nothing in the selected messages asked for a plan change.'
      )
    } catch {
      setError('The plan was not updated.')
    } finally {
      setPublishing(false)
    }
  }

  const askAboutPlan = async () => {
    const text = question.trim()
    if (!text) {
      setError('Write a question about the plan.')
      return
    }
    setAsking(true)
    setError('')
    setNotice('')
    setAnswer('')
    try {
      const res = await fetch('/api/coach/chat-assist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'ask_plan',
          conversationId,
          question: text,
          messageIds: [...selected],
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; answer?: string; error?: string }
        | null
      if (!res.ok || !json?.success || !json.answer) {
        setError(json?.error || 'No answer came back.')
        return
      }
      setAnswer(json.answer)
    } catch {
      setError('No answer came back.')
    } finally {
      setAsking(false)
    }
  }

  return (
    <aside
      className="coach-chat-assist"
      style={{
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.bgElevated,
      }}
    >
      <div className="coach-chat-assist-body">
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textMuted }}>
          Plan edit from chat
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: colors.textSecondary }}>
          {loading && !summary ? 'Reading what they said…' : summary || 'Tick the messages to use as the reference.'}
        </p>

        <p style={{ margin: '12px 0 6px', fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
          Messages to use ({selected.size} selected)
        </p>
        <div
          style={{
            display: 'grid',
            gap: 6,
            maxHeight: 180,
            overflow: 'auto',
            paddingRight: 2,
          }}
        >
          {selectable.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>No messages in this chat yet.</p>
          ) : (
            selectable.map((message) => {
              const checked = selected.has(message.id)
              return (
                <label
                  key={message.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '18px minmax(0, 1fr)',
                    gap: 8,
                    alignItems: 'start',
                    padding: '8px 8px',
                    borderRadius: 8,
                    border: `1px solid ${checked ? colors.accent : colors.borderSubtle}`,
                    background: checked ? colors.accentMuted : colors.bgCard,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(message.id)}
                    aria-label={`Use ${senderLabel(message)} message as a reference`}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: colors.textMuted }}>
                      {senderLabel(message)}
                    </span>
                    <span style={{ display: 'block', fontSize: 13, lineHeight: 1.4, color: colors.textPrimary }}>
                      {messagePreview(message)}
                    </span>
                  </span>
                </label>
              )
            })
          )}
        </div>

        <label htmlFor="coach-plan-edit-comment" style={{ display: 'block', marginTop: 12, fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
          Your comments
        </label>
        <textarea
          id="coach-plan-edit-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          maxLength={1500}
          placeholder="Add what the plan should change, or what to leave alone."
          style={fieldStyle}
        />

        <p style={{ margin: '16px 0 0', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textMuted }}>
          Ask about the live plan
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: colors.textSecondary }}>
          Private answer from the plan the client has now. Use it to reply in chat. Ticked messages are optional context.
        </p>
        <label htmlFor="coach-plan-ask-question" style={{ display: 'block', marginTop: 10, fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
          Your question
        </label>
        <textarea
          id="coach-plan-ask-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          maxLength={1500}
          placeholder="Example: Why is Day 3 only 4 exercises? What can I tell them about swaps for paneer?"
          style={fieldStyle}
        />
        <button
          type="button"
          onClick={() => void askAboutPlan()}
          disabled={asking || publishing}
          style={{
            marginTop: 8,
            minHeight: 34,
            padding: '0 12px',
            borderRadius: 8,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgCard,
            color: colors.textPrimary,
            fontWeight: 700,
            fontSize: 13,
            cursor: asking || publishing ? 'wait' : 'pointer',
          }}
        >
          {asking ? 'Reading the plan…' : 'Ask about this plan'}
        </button>
        {answer ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgCard,
            }}
          >
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: colors.textMuted }}>
              For you only
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: colors.textPrimary, whiteSpace: 'pre-wrap' }}>
              {answer}
            </p>
          </div>
        ) : null}

        {error ? <p style={{ margin: '8px 0 0', fontSize: 13, color: '#9f1239' }}>{error}</p> : null}
        {notice ? <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.textSecondary }}>{notice}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => void publish()}
        disabled={publishing || asking}
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
          cursor: publishing || asking ? 'wait' : 'pointer',
        }}
      >
        {publishing ? 'Updating the plan…' : 'Update the plan from the selected messages'}
      </button>
    </aside>
  )
}
