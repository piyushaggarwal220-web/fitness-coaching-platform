'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BRAND_NAME, brandTitle } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { sanitizeAuthPasswordError, isLeakedPasswordAuthError } from '@/lib/auth-password-errors'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { colors } from '@/lib/design-tokens'

const supabase = createClient()

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true

    const markReady = () => {
      if (!active) return
      setReady(true)
      setChecking(false)
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        markReady()
      }
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) {
        markReady()
      } else {
        setChecking(false)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      if (isLeakedPasswordAuthError(updateError.message)) {
        setError('Please choose a different password and try again.')
      } else {
        setError(sanitizeAuthPasswordError(updateError.message) ?? updateError.message)
      }
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
    setTimeout(() => {
      router.replace('/dashboard')
    }, 1200)
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
