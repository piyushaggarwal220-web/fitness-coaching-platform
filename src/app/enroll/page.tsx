'use client'

import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { brandTitle } from '@/lib/brand'
import { colors, spacing, radius } from '@/lib/design-tokens'

function EnrollInner() {
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [membershipHint, setMembershipHint] = useState<string | null>(null)

  useEffect(() => {
    const fromQuery = searchParams.get('code')?.trim() ?? ''
    if (fromQuery) setCode(fromQuery)
  }, [searchParams])

  const validateCode = async () => {
    if (!code.trim()) return
    const res = await fetch('/api/enroll/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (!res.ok || !data.valid) {
      setMembershipHint(null)
      setError(typeof data.error === 'string' ? data.error : 'Invalid code')
      return false
    }
    setError('')
    if (data.membershipExpiresAt) {
      setMembershipHint(
        `Access until ${new Date(data.membershipExpiresAt).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`
      )
    } else {
      setMembershipHint(data.planName ? `${data.planName} plan` : null)
    }
    return true
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const ok = await validateCode()
      if (!ok) {
        setLoading(false)
        return
      }
      const res = await fetch('/api/enroll/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          email,
          name,
          origin: window.location.origin,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not start enrollment')
        setLoading(false)
        return
      }
      setSent(true)
    } catch {
      setError('Something went wrong. Try again.')
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>{brandTitle('Check your email')}</h1>
          <p style={styles.subtitle}>
            We sent a confirmation link to <strong>{email}</strong>. Open it to confirm your email and
            set your password. You&apos;ll go straight to onboarding after that.
          </p>
          <Link href="/login" style={styles.link}>
            Already have an account? Log in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>{brandTitle('Member enrollment')}</h1>
        <p style={styles.subtitle}>
          Have a personal code from your coach? Enter it below to join the web platform. You&apos;ll
          confirm your email, set a password, then complete onboarding.
        </p>

        {error && <div style={styles.error}>{error}</div>}
        {membershipHint && !error && <div style={styles.hint}>{membershipHint}</div>}

        <form onSubmit={(e) => void handleSubmit(e)} style={styles.form}>
          <label style={styles.label}>
            Enrollment code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => void validateCode()}
              required
              autoComplete="off"
              placeholder="e.g. z36"
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Full name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={styles.input}
            />
          </label>
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Sending…' : 'Confirm email & continue'}
          </button>
        </form>

        <p style={styles.footer}>
          Paying online instead? <Link href="/checkout?plan=6_months">Go to checkout</Link>
        </p>
      </div>
    </div>
  )
}

export default function EnrollPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.page}>
          <div style={styles.card}>Loading…</div>
        </div>
      }
    >
      <EnrollInner />
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
  hint: {
    backgroundColor: colors.accentMuted,
    color: colors.textPrimary,
    padding: spacing[3],
    borderRadius: radius.sm,
    marginBottom: spacing[3],
    fontSize: 14,
  },
  link: { color: colors.accent, fontWeight: 600, fontSize: 14 },
  footer: { marginTop: spacing[4], fontSize: 13, color: colors.textMuted },
}
