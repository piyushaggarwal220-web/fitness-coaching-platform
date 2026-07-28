'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { BRAND_NAME } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { colors } from '@/lib/design-tokens'

const API_URL = '/api/public/talk-to-a-coach'

export default function TalkToCoachPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, message }),
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

      setSuccess('Thanks — we received your message. A coach will get back to you soon.')
      if (typeof payload.remaining === 'number') setRemaining(payload.remaining)
      setName('')
      setEmail('')
      setPhone('')
      setMessage('')
    } catch {
      setError('Network error. Please check your connection and try again.')
    }

    setLoading(false)
  }

  return (
    <div style={authStyles.page}>
      <div style={{ ...authStyles.card, maxWidth: 480 }}>
        <p style={authStyles.logo}>{BRAND_NAME}</p>
        <h1 style={authStyles.title}>Talk to a coach</h1>
        <p style={{ margin: '0 0 24px', textAlign: 'center', color: colors.textSecondary, lineHeight: 1.5 }}>
          Free consultation — tell us about your goals and we&apos;ll help you decide if LURVOX is the right fit.
        </p>

        {error && <p style={authStyles.error}>{error}</p>}
        {success && (
          <p style={{
            backgroundColor: colors.successMuted,
            color: colors.success,
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            textAlign: 'center',
            fontSize: 14,
          }}>
            {success}
          </p>
        )}
        {remaining != null && remaining === 0 && !success && (
          <p style={{ ...authStyles.error, marginBottom: 16 }}>
            You have used both consultation requests for this email and phone combination.
          </p>
        )}

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
            <label htmlFor="message" style={authStyles.label}>How can we help?</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              style={{ ...authStyles.input, minHeight: 120, resize: 'vertical' }}
              placeholder="Your goals, experience, and any questions..."
            />
          </div>
          <button type="submit" disabled={loading} style={authStyles.button}>
            {loading ? 'Sending…' : 'Send message'}
          </button>
        </form>

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
