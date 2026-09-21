'use client'

import { useCallback, useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { readApiJson } from '@/lib/api-response'
import type { CallBookingPolicy } from '@/lib/call-booking-policy'
import type { ClientCoachQueueView } from '@/lib/client-coach-queue'
import { colors, spacing } from '@/lib/design-tokens'

type ActiveCall = {
  id: string
  status: string
}

type Props = {
  compact?: boolean
}

export function CoachQueueCard({ compact = false }: Props) {
  const [policy, setPolicy] = useState<CallBookingPolicy | null>(null)
  const [queue, setQueue] = useState<ClientCoachQueueView | null>(null)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/client/weekly-call', { credentials: 'include', cache: 'no-store' })
      const parsed = await readApiJson<{
        success?: boolean
        policy?: CallBookingPolicy
        request?: ActiveCall | null
        queue?: ClientCoachQueueView
        error?: string
      }>(res)
      if (!parsed.ok) {
        setError(parsed.error || 'Could not load weekly call.')
        return
      }
      setError('')
      setPolicy(parsed.data.policy ?? null)
      setQueue(parsed.data.queue ?? null)
      setActiveCall(parsed.data.request ?? null)
    } catch {
      setError('Could not load weekly call.')
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  const startCall = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/client/weekly-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'start' }),
      })
      const parsed = await readApiJson<{ error?: string }>(res)
      if (!parsed.ok) throw new Error(parsed.error)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book this week’s call')
    } finally {
      setBusy(false)
    }
  }

  const cancelCall = async () => {
    if (busy || !activeCall) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/client/weekly-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'cancel', requestId: activeCall.id }),
      })
      const parsed = await readApiJson<{ error?: string }>(res)
      if (!parsed.ok) throw new Error(parsed.error)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel this call')
    } finally {
      setBusy(false)
    }
  }

  if (!policy?.isGrandfatheredAthleticBody) return null

  const heading = activeCall ? 'Your coach will call you this week' : 'Book a weekly call'
  const message =
    activeCall
      ? queue?.yourCall
        ? queue.message
        : 'Requested from Home. Your coach will call you when ready — you do not pick a time.'
      : policy.message ||
        queue?.message ||
        'Athletic Body members can book one weekly coach call from Home.'

  if (compact) {
    return (
      <div
        style={{
          margin: '0 12px 8px',
          padding: '10px 12px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#e9edef' }}>{heading}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#aebac1', lineHeight: 1.4 }}>{message}</p>
      </div>
    )
  }

  return (
    <Card
      variant="glass"
      style={{
        marginBottom: spacing[4],
        border: '1px solid rgba(249,115,22,0.22)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[3] }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.accentMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Phone size={20} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.accent,
            }}
          >
            Athletic Body
          </p>
          <h2 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>
            {heading}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
            {message}
          </p>
          {error ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.danger }}>{error}</p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {activeCall ? (
              <Button variant="secondary" onClick={() => void cancelCall()} disabled={busy}>
                Cancel this week’s call
              </Button>
            ) : policy.canRequestManualCall ? (
              <Button onClick={() => void startCall()} disabled={busy} loading={busy}>
                Book weekly call
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  )
}
