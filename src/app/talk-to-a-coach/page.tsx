'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { BRAND_NAME } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { colors } from '@/lib/design-tokens'
import { PLAN_PAGE_COPY, type LongCoachingPlanSlug } from '@/lib/payments/plan-pages'

const API_URL = '/api/public/talk-to-a-coach'

const PREFERRED_TIME_OPTIONS = [
  'Morning (9am–12pm)',
  'Afternoon (12pm–5pm)',
  'Evening (5pm–9pm)',
  'Anytime today',
  'Tomorrow',
] as const

const GOAL_OPTIONS = (['3_months', '6_months', '12_months'] as const).map((slug) => ({
  slug: slug as LongCoachingPlanSlug,
  goal: PLAN_PAGE_COPY[slug].goalName,
  duration: PLAN_PAGE_COPY[slug].durationLabel,
}))

const CONSULT_BOOKED_KEY = 'lurvox_consult_booked'

export default function TalkToCoachPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [goalSlug, setGoalSlug] = useState<LongCoachingPlanSlug | ''>('')
  const [notes, setNotes] = useState('')
  const [preferredTime, setPreferredTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [booked, setBooked] = useState(false)

  useEffect(() => {
    try {
      setBooked(window.localStorage.getItem(CONSULT_BOOKED_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!goalSlug) {
      setError('Please pick your goal.')
      return
    }
    if (!preferredTime) {
      setError('Please pick a preferred call time.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    const copy = PLAN_PAGE_COPY[goalSlug]
    const message = [
      `Goal: ${copy.goalName} (${copy.durationLabel})`,
      notes.trim() ? `\nNotes: ${notes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, message, preferredTime }),
      })
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        remaining?: number
      } | null

      if (!res.ok || !payload?.ok) {
        setError(payload?.error ?? 'Something went wrong. Please try again.')
        if (typeof payload?.remaining === 'number') setRemaining(payload.remaining)
        setLoading(false)
        return
      }

      setSuccess('Call booked. A coach will call you at your preferred time.')
      if (typeof payload.remaining === 'number') setRemaining(payload.remaining)
      setBooked(true)
      try {
        window.localStorage.setItem(CONSULT_BOOKED_KEY, '1')
      } catch {
        /* ignore */
      }
      setName('')
      setEmail('')
      setPhone('')
      setGoalSlug('')
      setNotes('')
      setPreferredTime('')
    } catch {
      setError('Network error. Please check your connection and try again.')
    }

    setLoading(false)
  }

  return (
    <div style={authStyles.page}>
      <div style={{ ...authStyles.card, maxWidth: 480 }}>
        <p style={authStyles.logo}>{BRAND_NAME}</p>
        <h1 style={authStyles.title}>{booked ? 'Call booked' : 'Talk to a coach'}</h1>
        <p style={{ margin: '0 0 24px', textAlign: 'center', color: colors.textSecondary, lineHeight: 1.5 }}>
          {booked
            ? 'We have your request. A coach will call you at the time you picked. No need to submit again.'
            : <>Free consultation — pick your goal and we&apos;ll help you decide if LURVOX is the right fit.</>}
        </p>

        {error && <p style={authStyles.error}>{error}</p>}
        {(success || booked) && (
          <p style={{
            backgroundColor: colors.successMuted,
            color: colors.success,
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            textAlign: 'center',
            fontSize: 14,
          }}>
            {success || 'Call booked. A coach will call you soon.'}
          </p>
        )}
        {remaining != null && remaining === 0 && !success && !booked && (
          <p style={{ ...authStyles.error, marginBottom: 16 }}>
            You have used both consultation requests for this email and phone combination.
          </p>
        )}

        {!booked && (
        <form onSubmit={handleSubmit} style={authStyles.form}>
          <div style={authStyles.inputGroup}>
            <label htmlFor="name" style={authStyles.label}>Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={authStyles.input}
              autoComplete="name"
            />
          </div>
          <div style={authStyles.inputGroup}>
            <label htmlFor="email" style={authStyles.label}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={authStyles.input}
              autoComplete="email"
            />
          </div>
          <div style={authStyles.inputGroup}>
            <label htmlFor="phone" style={authStyles.label}>Phone (WhatsApp)</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              style={authStyles.input}
              autoComplete="tel"
              placeholder="+91 98765 43210"
            />
          </div>
          <div style={authStyles.inputGroup}>
            <span style={authStyles.label}>Your goal</span>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: colors.textSecondary }}>
              Outcome first. Duration is secondary.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {GOAL_OPTIONS.map((option) => {
                const selected = goalSlug === option.slug
                return (
                  <button
                    key={option.slug}
                    type="button"
                    onClick={() => setGoalSlug(option.slug)}
                    style={{
                      minHeight: 52,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: selected ? `1px solid ${colors.accent}` : `1px solid ${colors.borderSubtle}`,
                      background: selected ? colors.accentMuted : colors.bgElevated,
                      color: colors.textPrimary,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 750 }}>{option.goal}</span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 650, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.6 }}>
                      {option.duration}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div style={authStyles.inputGroup}>
            <label htmlFor="notes" style={authStyles.label}>Anything else? (optional)</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...authStyles.input, minHeight: 88, resize: 'vertical' }}
              placeholder="Injuries, schedule, questions…"
            />
          </div>
          <div style={authStyles.inputGroup}>
            <span style={authStyles.label}>When should we call?</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {PREFERRED_TIME_OPTIONS.map((option) => {
                const selected = preferredTime === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPreferredTime(option)}
                    style={{
                      minHeight: 48,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: selected ? `1px solid ${colors.accent}` : `1px solid ${colors.borderSubtle}`,
                      background: selected ? colors.accentMuted : colors.bgElevated,
                      color: colors.textPrimary,
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>
          <button type="submit" disabled={loading || !preferredTime || !goalSlug} style={authStyles.button}>
            {loading ? 'Sending…' : 'Send message'}
          </button>
        </form>
        )}

        <p style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
          Already a client?{' '}
          <Link href="/login" style={{ color: colors.accent, fontWeight: 600 }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
