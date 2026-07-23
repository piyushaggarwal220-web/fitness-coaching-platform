'use client'

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'

type Scope = 'diet' | 'workout' | 'both'

type QuotaState = {
  usedToday: number
  usedThisMonth: number
  remainingToday: number
  remainingThisMonth: number
  canSubmit: boolean
}

type OpenRequest = {
  id: string
  status: string
  scope: string
  lockedAt: string
  draftReadyAt: string | null
  errorMessage: string | null
} | null

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'diet', label: 'Diet only' },
  { value: 'workout', label: 'Workout only' },
  { value: 'both', label: 'Diet + workout' },
]

export function PlanChangeRequestPanel() {
  const [quota, setQuota] = useState<QuotaState | null>(null)
  const [openRequest, setOpenRequest] = useState<OpenRequest>(null)
  const [scope, setScope] = useState<Scope>('both')
  const [requestText, setRequestText] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/plan-change-requests')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load change limits')
      setQuota(data.quota)
      setOpenRequest(data.openRequest ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load change limits')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!acceptedTerms) {
      setError('Please confirm you understand the change limits before locking in.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/plan-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestText, scope }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not lock in changes')
      setSuccess(
        data.message ??
          'Your changes are locked in. Your coach will review your request shortly.'
      )
      setRequestText('')
      setAcceptedTerms(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not lock in changes')
    } finally {
      setSubmitting(false)
    }
  }

  const statusMessage = (() => {
    if (!openRequest) return null
    if (openRequest.status === 'generating') {
      return 'Your request is locked in. Your coach will review it shortly — we are preparing the update for them.'
    }
    if (openRequest.status === 'draft_ready' || openRequest.status === 'in_review') {
      return 'Your coach will review your request shortly. Nothing changes on your live plan until they send an update.'
    }
    if (openRequest.status === 'failed') {
      return openRequest.errorMessage
        ? `Request failed: ${openRequest.errorMessage}`
        : 'Request failed. Contact your coach or try again tomorrow.'
    }
    return null
  })()

  return (
    <section style={styles.card}>
      <h2 style={styles.title}>Request a plan edit</h2>
      <p style={styles.lead}>
        Tell us what to change in your diet and/or workout. Your coach reviews every locked-in
        request before anything goes live.
      </p>

      <div style={styles.terms}>
        <p style={styles.termsTitle}>Terms for plan changes</p>
        <ul style={styles.termsList}>
          <li>
            You can lock in plan changes up to <strong>5 times per month</strong>.
          </li>
          <li>
            You can lock in only <strong>1 change request per day</strong>.
          </li>
          <li>
            Put <strong>all issues in one request</strong>. After you lock in, that day&apos;s
            chance is used — you cannot send a second list the same day.
          </li>
          <li>
            Locking in does <strong>not</strong> instantly change your live plan. Your coach reviews
            the update first, then sends it if approved.
          </li>
          <li>Vague or incomplete requests may be declined or delayed.</li>
        </ul>
      </div>

      {loading ? (
        <p style={styles.muted}>Loading limits…</p>
      ) : (
        <p style={styles.muted}>
          Remaining today: {quota?.remainingToday ?? 0}/1 · Remaining this month:{' '}
          {quota?.remainingThisMonth ?? 0}/5
        </p>
      )}

      {statusMessage && <div style={styles.status}>{statusMessage}</div>}
      {success && <div style={styles.success}>{success}</div>}
      {error && <div style={styles.error}>{error}</div>}

      {quota?.canSubmit && !openRequest && (
        <form onSubmit={onSubmit} style={{ marginTop: spacing[3] }}>
          <label style={styles.label}>What should we change?</label>
          <div style={styles.scopeRow}>
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setScope(opt.value)}
                style={{
                  ...styles.scopeChip,
                  ...(scope === opt.value ? styles.scopeChipActive : null),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label style={styles.label} htmlFor="plan-change-text">
            Write every change in one go
          </label>
          <textarea
            id="plan-change-text"
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            rows={6}
            placeholder="Example: Reduce rice at lunch, add paneer 3x/week, swap deadlifts for leg press because of lower-back tightness, keep evening workout time…"
            style={styles.textarea}
            required
            minLength={10}
            maxLength={4000}
          />

          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
            />
            <span>
              I understand the 5/month and 1/day limits, and I have listed all changes I need in this
              request.
            </span>
          </label>

          <button type="submit" disabled={submitting || !acceptedTerms} style={styles.lockBtn}>
            {submitting ? 'Locking in…' : 'Lock in changes'}
          </button>
        </form>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    marginTop: spacing[5],
    padding: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.borderSubtle}`,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: colors.textPrimary,
  },
  lead: {
    margin: '8px 0 0',
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 1.5,
  },
  terms: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
  },
  termsTitle: {
    margin: 0,
    fontWeight: 700,
    fontSize: 13,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  termsList: {
    margin: '10px 0 0',
    paddingLeft: 18,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 1.55,
  },
  muted: {
    marginTop: spacing[3],
    marginBottom: 0,
    fontSize: 13,
    color: colors.textMuted,
  },
  status: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.accentMuted,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 1.5,
  },
  success: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.successMuted,
    color: colors.success,
    fontSize: 14,
    lineHeight: 1.5,
  },
  error: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.dangerMuted,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    marginTop: spacing[3],
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  scopeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  scopeChip: {
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    color: colors.textSecondary,
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  scopeChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
    color: colors.accent,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: radius.md,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    padding: spacing[3],
    fontSize: 14,
    lineHeight: 1.5,
    resize: 'vertical',
  },
  checkRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: spacing[3],
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 1.45,
  },
  lockBtn: {
    marginTop: spacing[4],
    width: '100%',
    border: 'none',
    borderRadius: radius.md,
    padding: '14px 16px',
    backgroundColor: colors.accent,
    color: colors.textInverse,
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
}
