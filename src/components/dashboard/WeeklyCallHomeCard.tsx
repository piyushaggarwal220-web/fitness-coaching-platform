'use client'

import { useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { isWeeklyCallPlanSlug, type CallBookingPolicy } from '@/lib/call-booking-policy'
import { clientColors as colors, spacing } from '@/lib/design-tokens'

type OpenCall = {
  id: string
  status: string
}

type WeeklyCallResponse = {
  success?: boolean
  policy?: CallBookingPolicy
  request?: OpenCall | null
  error?: string
}

export function WeeklyCallCardView({
  detail,
  error,
  canBook,
  booking,
  booked,
  onPlaceCall,
}: {
  detail: string
  error?: string
  canBook: boolean
  booking?: boolean
  booked?: boolean
  onPlaceCall: () => void
}) {
  return (
    <Card
      variant="elevated"
      style={{
        marginBottom: spacing[4],
        border: `1px solid ${colors.borderSubtle}`,
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
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: colors.textPrimary }}>
            Weekly coach call
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: colors.textSecondary }}>
            {detail}
          </p>
          {error && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.danger }}>{error}</p>
          )}
          <div style={{ marginTop: spacing[3] }}>
            <Button
              type="button"
              fullWidth
              size="md"
              loading={booking}
              disabled={!canBook}
              onClick={onPlaceCall}
            >
              {booked ? 'Call booked' : 'Place a call'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function WeeklyCallHomeCard({
  hidden = false,
  planSlug = null,
}: {
  hidden?: boolean
  planSlug?: string | null
}) {
  const [policy, setPolicy] = useState<CallBookingPolicy | null>(null)
  const [openCall, setOpenCall] = useState<OpenCall | null>(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (hidden) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/client/weekly-call', { credentials: 'include', cache: 'no-store' })
        const payload = (await res.json().catch(() => null)) as WeeklyCallResponse | null
        if (cancelled) return
        if (!res.ok || !payload?.policy) {
          setError(payload?.error ?? 'Call booking could not be loaded.')
          setPolicy(null)
        } else {
          setPolicy(payload.policy)
          setOpenCall(payload.request ?? null)
          setError('')
        }
      } catch {
        if (!cancelled) setError('Call booking could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [hidden])

  const localPlan = isWeeklyCallPlanSlug(planSlug)
  if (hidden) return null
  if (policy && !policy.weeklyCallPlan) return null
  if (!policy && !localPlan) return null

  const canBook = Boolean(policy?.canRequestManualCall) && !openCall
  const detail = loading
    ? 'Checking your weekly call…'
    : !policy
      ? error || 'Call booking could not be loaded.'
      : policy.message
        ? policy.message
        : openCall
          ? 'You already booked a call this week. A coach will call you.'
          : 'Place one call a week. A coach will call you back. You do not pick a time.'

  const placeCall = async () => {
    if (!canBook || booking) return
    setBooking(true)
    setError('')
    try {
      const res = await fetch('/api/client/weekly-call', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const payload = (await res.json().catch(() => null)) as WeeklyCallResponse | null
      if (!res.ok) {
        setError(payload?.error ?? 'Could not place this call.')
        setBooking(false)
        return
      }
      if (payload?.request) setOpenCall(payload.request)
      setPolicy((current) =>
        current
          ? {
              ...current,
              canRequestManualCall: false,
              message: 'You already booked a call this week. A coach will call you.',
            }
          : current
      )
    } catch {
      setError('Could not place this call. Check your connection and try again.')
    }
    setBooking(false)
  }

  return (
    <WeeklyCallCardView
      detail={detail}
      error={error && policy ? error : undefined}
      canBook={canBook}
      booking={booking}
      booked={Boolean(openCall)}
      onPlaceCall={() => void placeCall()}
    />
  )
}
