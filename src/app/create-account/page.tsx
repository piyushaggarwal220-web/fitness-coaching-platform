'use client'

import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { brandTitle } from '@/lib/brand'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing, radius } from '@/lib/design-tokens'
import { isLeakedPasswordAuthError } from '@/lib/auth-password-errors'
import { PasswordInput } from '@/components/ui/PasswordInput'

const supabase = createClient()

function CreateAccountForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const queryEmail = searchParams.get('email')?.trim() ?? ''
  const queryPaymentId = searchParams.get('paymentId')?.trim() ?? ''

  const [name, setName] = useState('')
  const [email, setEmail] = useState(queryEmail)
  const [paymentId, setPaymentId] = useState(queryPaymentId)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [planName, setPlanName] = useState('')
  const [loading, setLoading] = useState(false)
  const [lookingUp, setLookingUp] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'token' | 'receipt'>(token ? 'token' : 'receipt')

  useEffect(() => {
    if (!token) {
      setLookingUp(false)
      return
    }

    let cancelled = false
    const run = async () => {
      setLookingUp(true)
      setError('')
      try {
        const res = await fetch('/api/payment/claim-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error ?? 'This setup link is invalid')
        }
        if (cancelled) return
        setEmail(data.customerEmail ?? '')
        setName(data.customerName ?? '')
        setPlanName(data.planName ?? '')
        setMode('token')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Setup link lookup failed')
        setMode('receipt')
      } finally {
        if (!cancelled) setLookingUp(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const payload =
        mode === 'token' && token
          ? { token, password, name }
          : { email, paymentId, password, name }

      const res = await fetch('/api/payment/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        const raw = typeof data.error === 'string' ? data.error : 'Could not create account'
        if (isLeakedPasswordAuthError(raw)) {
          throw new Error('Please choose a different password and try again.')
        }
        throw new Error(raw)
      }

      if (data.needsLogin) {
        router.push(data.redirectTo ?? '/login?linked=1')
        return
      }

      if (!data.sessionEstablished) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (signInError) {
          throw new Error(
            'Account created but sign-in failed. Please use the login page with your new password.'
          )
        }
      }

      router.refresh()
      router.push(data.redirectTo ?? '/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>{brandTitle('Create your account')}</h1>
        <p style={styles.subtitle}>
          {planName
            ? `Payment received for ${planName}. Set a password to continue.`
            : 'Set your password to unlock onboarding. If you left after paying, use your email and Razorpay payment ID.'}
        </p>

        {lookingUp && <p style={styles.hint}>Checking your payment…</p>}
        {error && <div style={styles.error}>{error}</div>}

        {!lookingUp && (
          <form onSubmit={handleSubmit} style={styles.form}>
            {mode === 'receipt' && (
              <>
                <label style={styles.label}>Email used at checkout</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={styles.input}
                  autoComplete="email"
                />

                <label style={styles.label}>Razorpay payment ID</label>
                <input
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                  required
                  placeholder="pay_…"
                  style={styles.input}
                  autoComplete="off"
                />
                <p style={styles.hint}>
                  Find this on your Razorpay SMS/email receipt (starts with pay_).
                </p>
              </>
            )}

            {mode === 'token' && email && (
              <p style={styles.hint}>Creating account for <strong>{email}</strong></p>
            )}

            <label style={styles.label}>Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={styles.input}
              autoComplete="name"
            />

            <label style={styles.label}>Create access key (min 6 characters)</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              inputStyle={styles.input}
              name="new_access_key"
              aria-label="Create password"
              autoComplete="off"
            />

            <label style={styles.label}>Confirm access key</label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              inputStyle={styles.input}
              name="confirm_access_key"
              aria-label="Confirm password"
              autoComplete="off"
            />

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Creating account…' : 'Create account & continue'}
            </button>
          </form>
        )}

        <p style={styles.footer}>
          {mode === 'token' ? (
            <>
              Lost your link?{' '}
              <button type="button" style={styles.textBtn} onClick={() => setMode('receipt')}>
                Use email + payment ID
              </button>
            </>
          ) : (
            <>
              Already set up?{' '}
              <Link href="/login" style={styles.link}>
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export default function CreateAccountPage() {
  return (
    <Suspense fallback={<div style={styles.loading}>Loading…</div>}>
      <CreateAccountForm />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: colors.bgPrimary,
    padding: `${spacing[6]}px ${spacing[3]}px`,
  },
  card: {
    maxWidth: 520,
    margin: '0 auto',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing[6],
    border: `1px solid ${colors.borderSubtle}`,
  },
  title: {
    margin: '0 0 8px',
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  subtitle: { margin: '0 0 20px', color: colors.textSecondary, lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 8, color: colors.textSecondary },
  input: {
    padding: '14px 16px',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    fontSize: 16,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    minHeight: 56,
  },
  button: {
    marginTop: spacing[3],
    padding: 16,
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    borderRadius: radius.md,
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    minHeight: 56,
  },
  error: {
    backgroundColor: colors.dangerMuted,
    color: colors.danger,
    padding: spacing[2],
    borderRadius: radius.sm,
    marginBottom: spacing[2],
  },
  hint: { margin: '0 0 8px', fontSize: 13, color: colors.textMuted, lineHeight: 1.45 },
  footer: { marginTop: spacing[4], fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  link: { color: colors.accent, fontWeight: 600, textDecoration: 'none' },
  textBtn: {
    background: 'none',
    border: 'none',
    color: colors.accent,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    fontSize: 14,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    color: colors.textSecondary,
    backgroundColor: colors.bgPrimary,
  },
}
