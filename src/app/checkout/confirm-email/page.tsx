'use client'

import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { brandTitle } from '@/lib/brand'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing, radius } from '@/lib/design-tokens'

function ConfirmEmailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const verificationId = searchParams.get('vid')?.trim() ?? ''
  const plan = searchParams.get('plan')?.trim() ?? '3_months'
  const [message, setMessage] = useState('Confirming your email…')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!verificationId) {
        setFailed(true)
        setMessage('Missing verification details. Go back to checkout and send the email again.')
        return
      }

      const supabase = createClient()

      // Allow the SSR client a moment to pick up the magic-link session.
      for (let i = 0; i < 8; i += 1) {
        const { data } = await supabase.auth.getUser()
        if (data.user?.email) break
        await new Promise((r) => setTimeout(r, 250))
      }

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user?.email) {
        if (!cancelled) {
          setFailed(true)
          setMessage(
            'Could not confirm from this link. Open the newest email on this phone/browser, or return to checkout and resend.'
          )
        }
        return
      }

      const res = await fetch('/api/payment/confirm-email-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (!cancelled) {
          setFailed(true)
          setMessage(typeof data.error === 'string' ? data.error : 'Email confirmation failed')
        }
        return
      }

      if (!cancelled) {
        setMessage('Email verified. Returning to checkout…')
        router.replace(
          `/checkout?plan=${encodeURIComponent(plan)}&vid=${encodeURIComponent(verificationId)}&emailVerified=1`
        )
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [verificationId, plan, router])

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>{brandTitle(failed ? 'Verification needed' : 'Verifying email')}</h1>
        <p style={styles.subtitle}>{message}</p>
        {failed && (
          <a href={`/checkout?plan=${encodeURIComponent(plan)}`} style={styles.link}>
            Back to checkout
          </a>
        )}
      </div>
    </div>
  )
}

export default function ConfirmCheckoutEmailPage() {
  return (
    <Suspense fallback={<div style={styles.page}><div style={styles.card}>Loading…</div></div>}>
      <ConfirmEmailInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: colors.bgPrimary,
    padding: `${spacing[4]}px ${spacing[2]}px`,
    display: 'flex',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing[5],
    border: `1px solid ${colors.borderSubtle}`,
    boxSizing: 'border-box',
  },
  title: { margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: colors.textPrimary },
  subtitle: { margin: 0, color: colors.textSecondary, lineHeight: 1.5 },
  link: {
    display: 'inline-block',
    marginTop: 16,
    color: colors.accent,
    fontWeight: 600,
    textDecoration: 'none',
  },
}
