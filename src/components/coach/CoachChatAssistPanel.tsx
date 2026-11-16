'use client'

import { useEffect, useState } from 'react'
import { colors } from '@/lib/coach-theme'

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

type SectionId = 'edit' | 'ask'

export function CoachChatAssistPanel({
  conversationId,
  selectedMessageIds,
  onClearSelection,
}: {
  conversationId: string
  selectedMessageIds: ReadonlySet<string>
  onClearSelection: () => void
}) {
  const [section, setSection] = useState<SectionId>('edit')
  const [comment, setComment] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setComment('')
    setQuestion('')
    setAnswer('')
    setNotice('')
    setError('')
    setSection('edit')
  }, [conversationId])

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
  }, [conversationId])

  const publish = async () => {
    const coachComment = comment.trim()
    if (selectedMessageIds.size === 0 && !coachComment) {
      setError('Tap messages in the chat, or write a comment.')
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
          messageIds: [...selectedMessageIds],
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
          messageIds: [...selectedMessageIds],
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

  const tabStyle = (active: boolean) => ({
    flex: 1,
    minHeight: 36,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${active ? colors.accent : colors.borderSubtle}`,
    background: active ? colors.accentMuted : colors.bgCard,
    color: active ? colors.accent : colors.textSecondary,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer' as const,
  })

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={() => setSection('edit')} style={tabStyle(section === 'edit')}>
          Edit plan
        </button>
        <button type="button" onClick={() => setSection('ask')} style={tabStyle(section === 'ask')}>
          Ask about plan
        </button>
      </div>

      <div className="coach-chat-assist-body" style={{ marginTop: 12 }}>
        {section === 'edit' ? (
          <>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textMuted }}>
              AI plan edit
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: colors.textSecondary }}>
              Tap messages in the chat to use them. Add a comment if you want.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              {selectedMessageIds.size} message{selectedMessageIds.size === 1 ? '' : 's'} selected
            </p>
            {selectedMessageIds.size > 0 ? (
              <button
                type="button"
                onClick={onClearSelection}
                style={{
                  marginTop: 6,
                  minHeight: 30,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: `1px solid ${colors.borderSubtle}`,
                  background: colors.bgCard,
                  color: colors.textSecondary,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Clear selection
              </button>
            ) : null}
            <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.4, color: colors.textMuted }}>
              {loading && !summary ? 'Reading what they said…' : summary || 'Private note loads here after chat activity.'}
            </p>
            <label htmlFor="coach-plan-edit-comment" style={{ display: 'block', marginTop: 12, fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              Comments (optional)
            </label>
            <textarea
              id="coach-plan-edit-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              maxLength={1500}
              placeholder="What the plan should change, or what to leave alone."
              style={fieldStyle}
            />
            {error ? <p style={{ margin: '8px 0 0', fontSize: 13, color: '#9f1239' }}>{error}</p> : null}
            {notice ? <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.textSecondary }}>{notice}</p> : null}
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textMuted }}>
              Live plan Q&A
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: colors.textSecondary }}>
              Private answer from the plan the client has now. Use it to reply in chat.
            </p>
            {selectedMessageIds.size > 0 ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.textMuted }}>
                {selectedMessageIds.size} chat message{selectedMessageIds.size === 1 ? '' : 's'} will be included as context.
              </p>
            ) : null}
            <label htmlFor="coach-plan-ask-question" style={{ display: 'block', marginTop: 12, fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              Your question
            </label>
            <textarea
              id="coach-plan-ask-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              maxLength={1500}
              placeholder="Example: Why is Day 3 only 4 exercises? What can I tell them about paneer swaps?"
              style={fieldStyle}
            />
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
          </>
        )}
      </div>

      {section === 'edit' ? (
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
          {publishing ? 'Updating the plan…' : 'Update the plan from the selection'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void askAboutPlan()}
          disabled={asking || publishing}
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
            cursor: asking || publishing ? 'wait' : 'pointer',
          }}
        >
          {asking ? 'Reading the plan…' : 'Ask about this plan'}
        </button>
      )}
    </aside>
  )
}
