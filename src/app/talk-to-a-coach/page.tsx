'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { BRAND_NAME } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { colors } from '@/lib/design-tokens'

const API_URL = '/api/public/talk-to-a-coach'
const CONSULT_BOOKED_KEY = 'lurvox_consult_booked'

export default function TalkToCoachPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
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

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          message: 'Please call me about LURVOX coaching.',
        }),
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

      setSuccess('Call booked. A coach will call you back soon.')
      if (typeof payload.remaining === 'number') setRemaining(payload.remaining)
      setBooked(true)
      try {
        window.localStorage.setItem(CONSULT_BOOKED_KEY, '1')
      } catch {
        /* ignore */
      }
      setName('')
      setPhone('')
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
            ? 'We have your request. A coach will call you. No need to submit again.'
            : 'Name and WhatsApp. A coach calls you.'}
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
            You have used both consultation requests for this phone number.
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
              placeholder="Your full name"
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
          <button type="submit" disabled={loading} style={authStyles.button}>
            {loading ? 'Sending…' : 'Request a free call'}
          </button>
        </form>
        )}

        <a
          href="https://www.lurvox.in/"
          style={{
            ...authStyles.button,
            display: 'block',
            marginTop: 20,
            textAlign: 'center',
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          Back to home
        </a>

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
