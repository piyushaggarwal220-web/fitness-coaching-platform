'use client'

import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { brandTitle } from '@/lib/brand'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing, radius } from '@/lib/design-tokens'

function SetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token) {
        setError('Missing enrollment link. Ask your coach for a new code invite.')
        setChecking(false)
        return
      }
      const res = await fetch(`/api/enroll/complete?token=${encodeURIComponent(token)}`)
      const data = await res.json()
      if (!res.ok || !data.valid) {
        if (!cancelled) {
          setError(typeof data.error === 'string' ? data.error : 'Invalid or expired link')
          setChecking(false)
        }
        return
      }
      if (!cancelled) {
        setEmail(data.email)
        setName(data.name ?? '')
        setChecking(false)
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
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/enroll/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not finish enrollment')
        setLoading(false)
        return
      }

      const supabase = createClient()
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      })
      if (signError) {
        setError('Account created. Please log in with your new password.')
        setLoading(false)
        router.replace('/login')
        return
      }
      router.replace(data.redirectTo || '/onboarding')
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>{brandTitle('Confirming email…')}</h1>
          <p style={styles.subtitle}>One moment while we verify your enrollment link.</p>
        </div>
      </div>
    )
  }

  if (error && !email) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>{brandTitle('Link expired')}</h1>
          <p style={styles.subtitle}>{error}</p>
          <Link href="/enroll" style={styles.link}>
            Start enrollment again
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>{brandTitle('Set your password')}</h1>
        <p style={styles.subtitle}>
          Email confirmed for <strong>{email}</strong>
          {name ? ` (${name})` : ''}. Choose a password to open onboarding.
        </p>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={(e) => void handleSubmit(e)} style={styles.form}>
          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              style={styles.input}
            />
          </label>
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Creating account…' : 'Continue to onboarding'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function EnrollSetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.page}>
          <div style={styles.card}>Loading…</div>
        </div>
      }
    >
      <SetPasswordInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: colors.bgPrimary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    border: `1px solid ${colors.borderSubtle}`,
    padding: spacing[6],
  },
  title: { margin: 0, fontSize: 24, color: colors.textPrimary },
  subtitle: { margin: `${spacing[2]} 0 ${spacing[4]}`, color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: spacing[3] },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: colors.textSecondary },
  input: {
    padding: '12px 14px',
    borderRadius: radius.sm,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgPrimary,
    color: colors.textPrimary,
    fontSize: 16,
  },
  button: {
    marginTop: spacing[2],
    padding: '14px 16px',
    borderRadius: radius.sm,
    border: 'none',
    backgroundColor: colors.accent,
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    minHeight: 48,
  },
  error: {
    backgroundColor: 'rgba(220,38,38,0.12)',
    color: '#fca5a5',
    padding: spacing[3],
    borderRadius: radius.sm,
    marginBottom: spacing[3],
    fontSize: 14,
  },
  link: { color: colors.accent, fontWeight: 600, fontSize: 14 },
}
