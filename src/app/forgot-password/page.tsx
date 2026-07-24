'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BRAND_NAME, brandTitle } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { resolveAuthEmailRedirectOrigin } from '@/lib/admin/portal-urls'
import { colors } from '@/lib/design-tokens'

const supabase = createClient()

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

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

    const origin = resolveAuthEmailRedirectOrigin(window.location.origin)
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo,
    })

    // Always show success for valid-looking emails to avoid account enumeration.
    if (resetError && /rate limit|too many/i.test(resetError.message)) {
      setError('Too many reset emails. Wait a minute and try again.')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div style={authStyles.page}>
      <div style={authStyles.card}>
        <div style={authStyles.logo}>{BRAND_NAME}</div>
        <h1 style={authStyles.title}>{brandTitle('Forgot password')}</h1>
        <p style={{ margin: '0 0 20px', color: colors.textSecondary, fontSize: 14, lineHeight: 1.5, textAlign: 'center' }}>
          Enter your login email and we will send a secure link to create a new password.
        </p>

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
            If an account exists for <strong>{email.trim().toLowerCase()}</strong>, a reset link is on its way.
            Check inbox and spam, then open the link to set a new password.
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
