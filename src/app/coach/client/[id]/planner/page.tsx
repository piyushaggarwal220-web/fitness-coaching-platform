'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { coachPageStyles } from '@/lib/coach-page-styles'
import { colors } from '@/lib/coach-theme'
import {
  CHECKIN_SPLIT_PREFERENCE_OPTIONS,
  WORKOUT_DIFFICULTY_OPTIONS,
  formatTrainingChoiceNote,
} from '@/lib/ai/workout-split'

type PlannerMessage = {
  id: string
  role: 'coach' | 'assistant' | 'summary' | 'request'
  content: string
  created_at: string
  published_plan_id: string | null
}

const ROLE_LABEL: Record<PlannerMessage['role'], string> = {
  coach: 'You',
  assistant: 'Planner',
  summary: 'Recap',
  request: 'Client request',
}

export default function CoachClientPlannerPage() {
  return (
    <Suspense fallback={<CoachShell loading narrow />}>
      <PlannerChat />
    </Suspense>
  )
}

function PlannerChat() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clientId = typeof params.id === 'string' ? params.id : ''
  const requestId = searchParams.get('request')?.trim() || ''
  const checkinId = searchParams.get('checkin')?.trim() || ''
  const [clientName, setClientName] = useState('Client')
  const [messages, setMessages] = useState<PlannerMessage[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [canRestorePrevious, setCanRestorePrevious] = useState(false)
  const [draft, setDraft] = useState('')
  const [splitChoice, setSplitChoice] = useState('keep')
  const [difficultyChoice, setDifficultyChoice] = useState('moderate')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    if (!clientId) return
    setError('')
    const params = new URLSearchParams()
    if (requestId) params.set('request', requestId)
    if (checkinId) params.set('checkin', checkinId)
    const query = params.size > 0 ? `?${params.toString()}` : ''
    const response = await fetch(`/api/coach/clients/${clientId}/planner${query}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const body = (await response.json().catch(() => null)) as {
      clientName?: string
      messages?: PlannerMessage[]
      activePlanId?: string | null
      canRestorePrevious?: boolean
      error?: string
    } | null
    if (!response.ok) {
      setError(body?.error || 'Could not load this planner.')
      setLoading(false)
      return
    }
    setClientName(body?.clientName || 'Client')
    setMessages(body?.messages ?? [])
    setActivePlanId(body?.activePlanId ?? null)
    setCanRestorePrevious(Boolean(body?.canRestorePrevious))
    setLoading(false)
  }, [clientId, requestId, checkinId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, sending])

  const send = async () => {
    const typed = draft.trim()
    if (!typed || sending || !clientId) return
    const message = [formatTrainingChoiceNote(splitChoice, difficultyChoice), typed].join('\n')
    setSending(true)
    setError('')
    setDraft('')
    try {
      const response = await fetch(`/api/coach/clients/${clientId}/planner`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          requestId: requestId || undefined,
          checkinId: checkinId || undefined,
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        messages?: PlannerMessage[]
        activePlanId?: string | null
        canRestorePrevious?: boolean
        error?: string
      } | null
      if (!response.ok) {
        setDraft(message)
        setError(body?.error || 'Could not send that.')
        return
      }
      setMessages(body?.messages ?? [])
      setActivePlanId(body?.activePlanId ?? null)
      setCanRestorePrevious(Boolean(body?.canRestorePrevious))
    } catch {
      setDraft(message)
      setError('Could not send that.')
    } finally {
      setSending(false)
    }
  }

  const restore = async (messageId: string) => {
    if (sending || !clientId) return
    setSending(true)
    setError('')
    try {
      const response = await fetch(`/api/coach/clients/${clientId}/planner`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', messageId }),
      })
      const body = (await response.json().catch(() => null)) as {
        messages?: PlannerMessage[]
        activePlanId?: string | null
        canRestorePrevious?: boolean
        error?: string
      } | null
      if (!response.ok) {
        setError(body?.error || 'Could not put the previous plan back.')
        return
      }
      setMessages(body?.messages ?? [])
      setActivePlanId(body?.activePlanId ?? null)
      setCanRestorePrevious(Boolean(body?.canRestorePrevious))
    } catch {
      setError('Could not put the previous plan back.')
    } finally {
      setSending(false)
    }
  }

  if (!clientId) {
    return (
      <CoachShell narrow>
        <p style={{ color: colors.danger }}>Invalid client.</p>
      </CoachShell>
    )
  }

  return (
    <CoachShell narrow>
      <Link href={`/coach/client/${clientId}`} style={coachPageStyles.backLink}>
        ← Back to client
      </Link>
      <div style={coachPageStyles.header}>
        <h1 style={coachPageStyles.title}>{clientName}</h1>
        <p style={coachPageStyles.subtitle}>
          Planner for this client only. Describe the change. After the check passes, the plan is sent to My Plan.
        </p>
      </div>

      {loading ? (
        <p style={{ color: colors.textMuted }}>Loading planner…</p>
      ) : (
        <div style={styles.thread}>
          {messages.length === 0 ? (
            <p style={styles.empty}>
              Describe what this person wants changed. The plan is sent after the check passes.
            </p>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                style={{
                  ...styles.bubble,
                  ...(message.role === 'coach'
                    ? styles.coach
                    : message.role === 'summary'
                      ? styles.summary
                      : message.role === 'request'
                        ? styles.request
                        : styles.assistant),
                }}
              >
                <div style={styles.role}>{ROLE_LABEL[message.role]}</div>
                <p style={styles.body}>{message.content}</p>
                {message.published_plan_id ? <div style={styles.published}>Published to My Plan</div> : null}
                {message.published_plan_id &&
                message.published_plan_id === activePlanId &&
                canRestorePrevious ? (
                  <button
                    type="button"
                    style={styles.restore}
                    disabled={sending}
                    onClick={() => void restore(message.id)}
                  >
                    Put the previous plan back
                  </button>
                ) : null}
              </article>
            ))
          )}
          {sending ? <p style={styles.pending}>Planner is working…</p> : null}
          <div ref={bottomRef} />
        </div>
      )}

      {error ? <p style={styles.error}>{error}</p> : null}

      <form
        style={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <label style={styles.choice}>
          Difficulty
          <select
            value={difficultyChoice}
            onChange={(event) => setDifficultyChoice(event.target.value)}
            style={styles.select}
            disabled={sending || loading}
          >
            {WORKOUT_DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.choice}>
          Split
          <select
            value={splitChoice}
            onChange={(event) => setSplitChoice(event.target.value)}
            style={styles.select}
            disabled={sending || loading}
          >
            {CHECKIN_SPLIT_PREFERENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What should change on this plan?"
          rows={3}
          style={styles.input}
          disabled={sending || loading}
        />
        <button type="submit" style={coachPageStyles.primaryBtn} disabled={sending || loading || !draft.trim()}>
          {sending ? 'Working…' : 'Send'}
        </button>
      </form>
    </CoachShell>
  )
}

const styles: Record<string, CSSProperties> = {
  thread: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: '58vh',
    overflowY: 'auto',
    marginBottom: 16,
    paddingRight: 4,
  },
  empty: { margin: 0, color: colors.textMuted, lineHeight: 1.5 },
  bubble: {
    borderRadius: 16,
    padding: '12px 14px',
    border: `1px solid ${colors.borderSubtle}`,
  },
  coach: { background: colors.accentMuted, marginLeft: 32 },
  assistant: { background: colors.bgSecondary, marginRight: 32 },
  summary: { background: colors.warningMuted, marginRight: 16, marginLeft: 16 },
  request: { background: colors.bgSecondary, marginRight: 16 },
  role: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 6,
  },
  body: { margin: 0, whiteSpace: 'pre-wrap', color: colors.textPrimary, lineHeight: 1.5 },
  published: { marginTop: 8, fontSize: 13, color: colors.success, fontWeight: 600 },
  restore: {
    marginTop: 8,
    padding: 0,
    border: 'none',
    background: 'none',
    color: colors.textPrimary,
    font: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  pending: { margin: 0, color: colors.textMuted },
  error: { color: colors.danger, margin: '0 0 12px' },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  choice: { display: 'block', fontSize: 13, fontWeight: 700, color: colors.textPrimary },
  select: {
    display: 'block',
    width: '100%',
    marginTop: 6,
    marginBottom: 10,
    padding: '8px 10px',
    borderRadius: 10,
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgElevated,
    color: colors.textPrimary,
  },
  input: {
    width: '100%',
    resize: 'vertical',
    borderRadius: 12,
    border: `1px solid ${colors.borderSubtle}`,
    padding: 12,
    font: 'inherit',
    color: colors.textPrimary,
    background: colors.bgPrimary,
  },
}
