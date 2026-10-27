'use client'

import { useCallback, useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clientColors as colors, spacing } from '@/lib/design-tokens'
import type { CallBookingPolicy } from '@/lib/call-booking-policy'

type CallRequest = {
  id: string
  status: 'requested' | 'scheduled' | string
}

type WeeklyCallResponse = {
  success?: boolean
  policy?: CallBookingPolicy
  request?: CallRequest | null
  error?: string
}

export function WeeklyCallHomeCard() {
  const [policy, setPolicy] = useState<CallBookingPolicy | null>(null)
  const [request, setRequest] = useState<CallRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const res = await fetch('/api/client/weekly-call', { cache: 'no-store' })
    const json = (await res.json().catch(() => null)) as WeeklyCallResponse | null
    if (!res.ok || !json?.success || !json.policy) {
      setError(json?.error || 'Could not load coach call.')
      setPolicy(null)
      setRequest(null)
      return
    }
    setError('')
    setPolicy(json.policy)
    setRequest(json.request ?? null)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void refresh().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  async function book() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/client/weekly-call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const json = (await res.json().catch(() => null)) as WeeklyCallResponse | null
      if (!res.ok) {
        setError(json?.error || 'Could not book this call.')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!request?.id) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/client/weekly-call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', requestId: request.id }),
      })
      const json = (await res.json().catch(() => null)) as WeeklyCallResponse | null
      if (!res.ok) {
        setError(json?.error || 'Could not cancel this call.')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (loading || !policy?.showHomeButton) return null

  const cadenceLabel =
    policy.callCadence === 'biweekly' ? 'Once every 2 weeks' : 'Once a week'
  const pending = Boolean(request && (request.status === 'requested' || request.status === 'scheduled'))

  return (
    <Card
      variant="glass"
      style={{
        marginBottom: spacing[4],
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.bgCard,
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
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Coach call</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted, lineHeight: 1.45 }}>
            {pending
              ? 'Requested. Your coach will call you — you do not pick a time.'
              : policy.message || `${cadenceLabel}. Your coach calls you after you tap the button.`}
          </p>
          {error ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.danger }}>{error}</p>
          ) : null}
          <div style={{ marginTop: spacing[3], display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pending ? (
              <Button variant="secondary" size="md" loading={busy} onClick={() => void cancel()}>
                Cancel request
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                loading={busy}
                disabled={!policy.canRequestManualCall}
                onClick={() => void book()}
              >
                Request a call
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
