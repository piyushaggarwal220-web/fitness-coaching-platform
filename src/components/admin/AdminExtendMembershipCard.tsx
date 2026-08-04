'use client'

import { useMemo, useState } from 'react'
import { adminStyles as s } from '@/lib/admin/styles'
import { subscriptionDaysRemaining } from '@/lib/entitlements'
import { formatDate } from '@/lib/coach-utils'
import type { OnboardingProfile } from '@/types/database'

type Mode = 'add_months' | 'add_days' | 'set_end_date'

type Props = {
  client: Pick<
    OnboardingProfile,
    'id' | 'payment_confirmed' | 'access_source' | 'subscription_expires_at'
  >
  onUpdated: (next: {
    payment_confirmed: boolean
    access_source: OnboardingProfile['access_source']
    subscription_expires_at: string
  }) => void
}

export function AdminExtendMembershipCard({ client, onUpdated }: Props) {
  const [mode, setMode] = useState<Mode>('add_months')
  const [months, setMonths] = useState(3)
  const [days, setDays] = useState(30)
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const daysLeft = useMemo(
    () => subscriptionDaysRemaining(client),
    [client]
  )

  const expiresLabel = client.subscription_expires_at
    ? formatDate(client.subscription_expires_at)
    : client.access_source === 'admin_trial'
      ? 'No expiry (admin trial)'
      : 'Not set'

  const handleExtend = async () => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const body =
        mode === 'add_months'
          ? { mode, months, reason }
          : mode === 'add_days'
            ? { mode, days, reason }
            : { mode, endDate, reason }

      const res = await fetch(`/api/admin/clients/${client.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as
        | {
            success?: boolean
            error?: string
            result?: {
              newExpiresAt: string
              previousExpiresAt: string | null
              accessSource: OnboardingProfile['access_source']
            }
          }
        | null
      if (!res.ok || !json?.success || !json.result) {
        throw new Error(json?.error ?? 'Failed to extend membership')
      }

      onUpdated({
        payment_confirmed: true,
        access_source: json.result.accessSource,
        subscription_expires_at: json.result.newExpiresAt,
      })
      setSuccess(
        `Membership updated to ${formatDate(json.result.newExpiresAt)}${
          json.result.previousExpiresAt
            ? ` (was ${formatDate(json.result.previousExpiresAt)})`
            : ''
        }.`
      )
      setReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extend membership')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={s.card}>
      <h2 style={s.cardTitle}>Membership timeline</h2>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: '#666', lineHeight: 1.5 }}>
        Extend or set this client’s access end date. Extensions stack from the later of today and the
        current end date.
      </p>

      <div style={{ ...s.infoGrid, marginBottom: 16 }}>
        <div style={s.infoRow}>
          <span style={s.infoLabel}>Access</span>
          <span style={s.infoValue}>
            {client.payment_confirmed ? 'Active' : 'Inactive'}
            {client.access_source ? ` · ${client.access_source.replace(/_/g, ' ')}` : ''}
          </span>
        </div>
        <div style={s.infoRow}>
          <span style={s.infoLabel}>Ends</span>
          <span style={s.infoValue}>{expiresLabel}</span>
        </div>
        <div style={s.infoRow}>
          <span style={s.infoLabel}>Days left</span>
          <span style={s.infoValue}>
            {daysLeft == null ? '—' : daysLeft <= 0 ? 'Expired' : `${Math.floor(daysLeft)} days`}
          </span>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}
      {success && (
        <div style={{ ...s.error, backgroundColor: '#d4edda', color: '#155724' }}>{success}</div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
          Extension type
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            style={s.select}
          >
            <option value="add_months">Add months</option>
            <option value="add_days">Add days</option>
            <option value="set_end_date">Set exact end date</option>
          </select>
        </label>

        {mode === 'add_months' && (
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
            Months to add
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              style={s.select}
            >
              {[1, 2, 3, 6, 9, 12, 18, 24].map((n) => (
                <option key={n} value={n}>
                  {n} month{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === 'add_days' && (
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
            Days to add
            <input
              type="number"
              min={1}
              max={3660}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={s.input}
            />
          </label>
        )}

        {mode === 'set_end_date' && (
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
            New end date
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={s.input}
            />
          </label>
        )}

        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
          Reason (required)
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Client paid for 6 months — correct expiry from 3 to 6"
            style={s.input}
          />
        </label>

        <button
          type="button"
          disabled={busy || reason.trim().length < 3}
          onClick={() => void handleExtend()}
          style={s.primaryBtn}
        >
          {busy ? 'Updating…' : 'Extend membership'}
        </button>
      </div>
    </div>
  )
}
