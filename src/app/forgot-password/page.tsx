'use client'

import { useState, type FormEvent, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { BRAND_NAME, brandTitle } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { colors } from '@/lib/design-tokens'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const linkError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const linkErrorMessage = (() => {
    if (linkError === 'open_same_device') {
      return 'That old reset link only works in the same browser where it was requested. Request a new link below — it will work on any device.'
    }
    if (linkError === 'link_expired' || linkError === 'link_missing') {
      return 'That reset link is invalid or expired. Request a new one below.'
    }
    if (linkError === 'auth_callback') {
      return 'That email link expired or was already used. Request a new one below.'
    }
    return ''
  })()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      setError('Enter the email you use to sign in.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }

      if (!res.ok) {
        if (/rate limit|too many/i.test(data.error || '')) {
          setError('Too many reset emails. Wait a minute and try again.')
        } else {
          setError(data.error || 'Could not send reset email. Try again.')
        }
        setLoading(false)
        return
      }

      setSent(true)
      setLoading(false)
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div style={authStyles.page}>
      <div style={authStyles.card}>
        <div style={authStyles.logo}>{BRAND_NAME}</div>
        <h1 style={authStyles.title}>{brandTitle('Forgot password')}</h1>
        <p
          style={{
            margin: '0 0 20px',
            color: colors.textSecondary,
            fontSize: 14,
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          Enter your login email and we will send a secure link to create a new password.
        </p>

        {linkErrorMessage && !sent && <div style={authStyles.error}>{linkErrorMessage}</div>}

        {sent ? (
          <div
            style={{
              backgroundColor: colors.successMuted ?? 'rgba(34,197,94,0.12)',
              color: colors.success ?? '#22c55e',
              padding: '14px 16px',
              borderRadius: 12,
              fontSize: 14,
              lineHeight: 1.55,
              marginBottom: 16,
            }}
          >
            If an account exists for <strong>{email.trim().toLowerCase()}</strong>, a reset link is on
            its way. Check inbox and spam, then open the link to set a new password. You can open it
            on any phone or computer.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={authStyles.form}>
            {error && <div style={authStyles.error}>{error}</div>}
            <div style={authStyles.inputGroup}>
              <label style={authStyles.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={authStyles.input}
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ ...authStyles.button, opacity: loading ? 0.6 : 1 }}
              className="btn-press"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p style={authStyles.link}>
          <Link href="/login" style={authStyles.linkColor}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div style={authStyles.page}>
          <div style={authStyles.card}>
            <div style={authStyles.logo}>{BRAND_NAME}</div>
            <p style={{ textAlign: 'center', color: colors.textSecondary }}>Loading…</p>
          </div>
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  )
}
