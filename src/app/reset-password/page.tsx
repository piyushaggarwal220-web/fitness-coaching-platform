'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { BRAND_NAME, brandTitle } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import {
  isLeakedPasswordAuthError,
  sanitizeAuthPasswordError,
} from '@/lib/auth-password-errors'
import {
  isPasswordReauthError,
  passwordReauthUserMessage,
} from '@/lib/auth-password-reset'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { colors } from '@/lib/design-tokens'

const supabase = createClient()

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [nonce, setNonce] = useState('')
  const [needsNonce, setNeedsNonce] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true

    const markReady = async (stampRecoveryCookie: boolean) => {
      if (!active) return
      setReady(true)
      setChecking(false)
      if (stampRecoveryCookie) {
        // Hash-based / late recovery sessions may skip /auth/callback cookie stamp.
        await fetch('/api/auth/mark-password-recovery', { method: 'POST' }).catch(() => undefined)
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') {
        void markReady(true)
      } else if (
        session &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')
      ) {
        void markReady(true)
      }
    })

    // Session cookies from /auth/callback can land a beat after mount — poll briefly
    // instead of flashing "invalid link" too early.
    void (async () => {
      for (let i = 0; i < 24 && active; i++) {
        const { data } = await supabase.auth.getSession()
        if (!active) return
        if (data.session) {
          await markReady(true)
          return
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      if (active) setChecking(false)
    })()

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const requestNonce = async (): Promise<boolean> => {
    const { error: reauthError } = await supabase.auth.reauthenticate()
    if (reauthError) {
      setError(
        sanitizeAuthPasswordError(reauthError.message) ??
          'Could not send a verification code. Request a new reset link and try again.'
      )
      return false
    }
    setNeedsNonce(true)
    setInfo(passwordReauthUserMessage(false))
    return true
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (needsNonce && !nonce.trim()) {
      setError('Enter the verification code from your email.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          ...(needsNonce && nonce.trim() ? { nonce: nonce.trim() } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
        success?: boolean
      }

      if (res.ok && data.success) {
        setDone(true)
        setLoading(false)
        setTimeout(() => {
          router.replace('/dashboard')
        }, 1200)
        return
      }

      const message = data.error ?? 'Could not update password.'

      if (data.code === 'reauthentication_required' || isPasswordReauthError(message)) {
        if (!needsNonce) {
          const sent = await requestNonce()
          setLoading(false)
          if (sent) {
            setError('')
          }
          return
        }
        setError(passwordReauthUserMessage(true))
        setLoading(false)
        return
      }

      if (isLeakedPasswordAuthError(message)) {
        setError('Please choose a different password and try again.')
      } else {
        setError(sanitizeAuthPasswordError(message) ?? message)
      }
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
        <h1 style={authStyles.title}>{brandTitle('Create a new password')}</h1>

        {checking && (
          <p style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 14 }}>
            Checking your reset link…
          </p>
        )}

        {!checking && !ready && !done && (
          <>
            <div style={authStyles.error}>
              This reset link is invalid or expired. Request a new one and open it on this device.
            </div>
            <p style={authStyles.link}>
              <Link href="/forgot-password" style={authStyles.linkColor}>
                Send a new reset link
              </Link>
            </p>
          </>
        )}

        {done && (
          <div
            style={{
              backgroundColor: colors.successMuted ?? 'rgba(34,197,94,0.12)',
              color: colors.success ?? '#22c55e',
              padding: '14px 16px',
              borderRadius: 12,
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            Password updated. Taking you to your dashboard…
          </div>
        )}

        {ready && !done && (
          <form onSubmit={handleSubmit} style={authStyles.form}>
            {error && <div style={authStyles.error}>{error}</div>}
            {info && !error && (
              <div
                style={{
                  backgroundColor: colors.successMuted ?? 'rgba(34,197,94,0.12)',
                  color: colors.success ?? '#22c55e',
                  padding: '14px 16px',
                  borderRadius: 12,
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                {info}
              </div>
            )}
            <div style={authStyles.inputGroup}>
              <label style={authStyles.label}>New login password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                inputStyle={authStyles.input}
                name="new_password"
                aria-label="New login password"
                autoComplete="new-password"
              />
            </div>
            <div style={authStyles.inputGroup}>
              <label style={authStyles.label}>Confirm password</label>
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                inputStyle={authStyles.input}
                name="confirm_password"
                aria-label="Confirm password"
                autoComplete="new-password"
              />
            </div>
            {needsNonce && (
              <div style={authStyles.inputGroup}>
                <label style={authStyles.label}>Email verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  required
                  style={authStyles.input}
                  placeholder="Code from your email"
                  aria-label="Email verification code"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{ ...authStyles.button, opacity: loading ? 0.6 : 1 }}
              className="btn-press"
            >
              {loading ? 'Saving…' : 'Save new password'}
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
