'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  getCheckinReplyTiming,
  getCoachReplyWaitMessage,
  type CheckinReplyTiming,
} from '@/lib/checkin-reply-timing'
import { colors } from '@/lib/coach-theme'
import { shouldBypassCheckinScheduleClient } from '@/lib/config'

type MidWeekAnalysisPanelProps = {
  checkinId: string
  submittedAt?: string | null
  reviewed?: boolean
  onReplyReady?: (clientReply: string) => void
  onSent?: (payload: { reviewedAt: string; feedback: string }) => void
}

export function MidWeekAnalysisPanel({
  checkinId,
  submittedAt = null,
  reviewed = false,
  onReplyReady,
  onSent,
}: MidWeekAnalysisPanelProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [clientReply, setClientReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sendSuccess, setSendSuccess] = useState('')
  const [timing, setTiming] = useState<CheckinReplyTiming | null>(() =>
    getCheckinReplyTiming(submittedAt)
  )
  const autoGenAttempted = useRef(false)
  const bypassWait = shouldBypassCheckinScheduleClient()

  useEffect(() => {
    setTiming(getCheckinReplyTiming(submittedAt))
    if (bypassWait || !submittedAt) return
    const id = window.setInterval(() => {
      setTiming(getCheckinReplyTiming(submittedAt))
    }, 30_000)
    return () => window.clearInterval(id)
  }, [submittedAt, bypassWait])

  const canSendNow = bypassWait || timing?.canSend !== false
  const waitHint = timing ? getCoachReplyWaitMessage(timing) : null

  const applyPack = useCallback(
    (pack: { summary?: string | null; clientReply?: string | null }) => {
      const nextSummary = pack.summary?.trim() || null
      const nextReply = pack.clientReply?.trim() || ''
      setSummary(nextSummary)
      setClientReply(nextReply)
      if (nextReply) onReplyReady?.(nextReply)
    },
    [onReplyReady]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/coach/midweek-summary?checkinId=${encodeURIComponent(checkinId)}`
      )
      const data = (await res.json().catch(() => null)) as {
        summary?: string | null
        clientReply?: string | null
        error?: string
      } | null
      if (!res.ok) {
        setError(data?.error ?? 'Could not load AI summary')
        setSummary(null)
        setClientReply('')
        return
      }
      applyPack(data ?? {})
    } catch {
      setError('Could not load AI summary')
      setSummary(null)
      setClientReply('')
    } finally {
      setLoading(false)
    }
  }, [applyPack, checkinId])

  useEffect(() => {
    autoGenAttempted.current = false
    void load()
  }, [load])

  const generate = useCallback(
    async (force: boolean) => {
      setGenerating(true)
      setError('')
      setSendSuccess('')
      try {
        const res = await fetch('/api/coach/midweek-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkinId, force }),
        })
        const data = (await res.json().catch(() => null)) as {
          summary?: string
          clientReply?: string
          error?: string
        } | null
        if (!res.ok) {
          setError(data?.error ?? 'AI summary failed')
          return
        }
        applyPack(data ?? {})
      } catch {
        setError('AI summary failed')
      } finally {
        setGenerating(false)
      }
    },
    [applyPack, checkinId]
  )

  // Auto-generate once if reply missing
  useEffect(() => {
    if (loading || generating || error || autoGenAttempted.current) return
    if (clientReply.trim()) return
    autoGenAttempted.current = true
    void generate(false)
  }, [loading, clientReply, generating, error, generate])

  const sendToClient = async () => {
    const feedback = clientReply.trim()
    if (!feedback) {
      setError('Generate or write a reply before sending.')
      return
    }
    if (!canSendNow) {
      setError(waitHint ?? 'Minimum reply wait has not elapsed yet.')
      return
    }
    setSending(true)
    setError('')
    setSendSuccess('')
    try {
      const res = await fetch('/api/coach/checkin/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkinId,
          feedback,
          action_items: '',
        }),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        reviewedAt?: string
        chatError?: string | null
      } | null
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Failed to send reply')
        return
      }
      setSendSuccess(
        data.chatError
          ? 'Marked reviewed, but chat delivery had an issue. Check chat.'
          : 'Sent to client chat and marked reviewed.'
      )
      onSent?.({
        reviewedAt: data.reviewedAt ?? new Date().toISOString(),
        feedback,
      })
    } catch {
      setError('Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Send mid-week reply</h2>
          <p style={styles.subtitle}>
            Short WhatsApp style reply (max 40 words). Edit if you want, then send after the
            minimum wait — clients expect a reply in 3–8 hours.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void generate(true)}
          disabled={generating || loading || sending}
          style={styles.refreshBtn}
        >
          {generating ? 'Generating…' : 'Regenerate'}
        </button>
      </div>

      {!reviewed && waitHint && (
        <p style={canSendNow ? styles.waitReady : styles.waitBlocked}>{waitHint}</p>
      )}

      {(loading || generating) && !clientReply && (
        <p style={styles.muted}>Drafting a coach style reply from this mid week check in…</p>
      )}
      {error && <p style={styles.error}>{error}</p>}
      {sendSuccess && <p style={styles.success}>{sendSuccess}</p>}

      <label style={styles.label}>Message to client (send as you)</label>
      <textarea
        value={clientReply}
        onChange={(e) => setClientReply(e.target.value)}
        rows={10}
        style={styles.textarea}
        placeholder="AI reply will appear here…"
        disabled={sending}
      />

      <div style={styles.actions}>
        {!reviewed && (
          <button
            type="button"
            onClick={() => void sendToClient()}
            disabled={sending || generating || !clientReply.trim() || !canSendNow}
            style={{
              ...styles.sendBtn,
              opacity: sending || generating || !clientReply.trim() || !canSendNow ? 0.55 : 1,
            }}
          >
            {sending
              ? 'Sending…'
              : canSendNow
                ? 'Send to client now'
                : 'Send locked until min wait'}
          </button>
        )}
        {reviewed && <span style={styles.reviewedNote}>Already sent</span>}
      </div>

      {summary && (
        <details style={styles.details}>
          <summary style={styles.summaryToggle}>Internal coach briefing</summary>
          <pre style={styles.summary}>{summary}</pre>
        </details>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  refreshBtn: {
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgCard,
    color: colors.textMuted,
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  muted: {
    margin: '0 0 8px',
    fontSize: 13,
    color: colors.textMuted,
  },
  waitBlocked: {
    margin: '0 0 10px',
    fontSize: 13,
    color: colors.warning,
    lineHeight: 1.4,
  },
  waitReady: {
    margin: '0 0 10px',
    fontSize: 13,
    color: colors.success,
    lineHeight: 1.4,
  },
  error: {
    margin: '0 0 8px',
    fontSize: 13,
    color: colors.danger,
  },
  success: {
    margin: '0 0 8px',
    fontSize: 13,
    color: colors.success,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 10,
    border: `1px solid ${colors.borderSubtle}`,
    padding: 12,
    fontSize: 14,
    lineHeight: 1.55,
    fontFamily: 'inherit',
    color: colors.textPrimary,
    background: colors.bgSecondary,
    resize: 'vertical',
    marginBottom: 12,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sendBtn: {
    border: 'none',
    background: colors.accent,
    color: '#fff',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  reviewedNote: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.success,
  },
  details: {
    marginTop: 8,
    borderTop: `1px solid ${colors.borderSubtle}`,
    paddingTop: 10,
  },
  summaryToggle: {
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: colors.textMuted,
  },
  summary: {
    margin: '10px 0 0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1.55,
    color: colors.textPrimary,
    background: colors.bgSecondary,
    borderRadius: 10,
    padding: 12,
    borderLeft: `3px solid ${colors.accent}`,
  },
}
