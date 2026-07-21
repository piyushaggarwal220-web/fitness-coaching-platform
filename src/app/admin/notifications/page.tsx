'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { brandTitle } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'

type Operations = {
  jobs: Array<{
    id: string
    channel: string
    state: string
    attempt_count: number
    escalation_reason: string | null
    last_error: string | null
    created_at: string
    notification_events: { event_type: string; title: string; body: string } | null
    notification_attempts: Array<{ id: number; state: string; error: string | null; created_at: string }>
  }>
  budget: { whatsapp_enabled: boolean; whatsapp_monthly_cap: number }
  metrics: {
    deadLetters: number
    deadLetterAlert: boolean
    whatsappSentThisMonth: number
    whatsappEstimatedCostMicros: number
    providerConfiguration: Record<string, boolean>
  }
}

export default function AdminNotificationsPage() {
  const [data, setData] = useState<Operations | null>(null)
  const [state, setState] = useState('all')
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/notification-operations?state=${state}`)
    if (response.ok) setData(await response.json())
  }, [state])
  useEffect(() => {
    let active = true
    void fetch(`/api/admin/notification-operations?state=${state}`)
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active && result) setData(result) })
    return () => { active = false }
  }, [state])

  const retry = async (jobId: string) => {
    await fetch('/api/admin/notification-operations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, retry: true }),
    })
    void load()
  }

  const toggleWhatsApp = async () => {
    if (!data) return
    await fetch('/api/admin/notification-operations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatsappEnabled: !data.budget.whatsapp_enabled }),
    })
    void load()
  }

  return (
    <AdminShell>
      <div style={s.container}>
        <h1 style={s.title}>{brandTitle('Notifications')}</h1>
        <p style={s.subtitle}>Durable delivery, escalation cost controls, and provider health.</p>

        <div style={s.statGrid}>
          <div style={s.statCard}>
            <div style={s.statLabel}>Dead-letter</div>
            <div style={{ ...s.statValue, color: data?.metrics.deadLetterAlert ? '#b42318' : undefined }}>
              {data?.metrics.deadLetters ?? '—'}
            </div>
            <div style={s.statHint}>Needs operator review</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>WhatsApp this month</div>
            <div style={s.statValue}>{data?.metrics.whatsappSentThisMonth ?? '—'}</div>
            <div style={s.statHint}>Cap: {data?.budget.whatsapp_monthly_cap ?? '—'}</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Estimated WhatsApp cost</div>
            <div style={s.statValue}>₹{(((data?.metrics.whatsappEstimatedCostMicros ?? 0) / 1_000_000)).toFixed(2)}</div>
            <div style={s.statHint}>Estimate; provider invoice is authoritative</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Paid-channel circuit</div>
            <div style={s.statValue}>{data?.budget.whatsapp_enabled ? 'On' : 'Paused'}</div>
            <button type="button" style={s.linkBtn} onClick={() => void toggleWhatsApp()}>
              {data?.budget.whatsapp_enabled ? 'Pause WhatsApp' : 'Resume WhatsApp'}
            </button>
          </div>
        </div>

        <div style={s.card}>
          <h2 style={s.cardTitle}>Provider configuration</h2>
          <p style={{ fontSize: 14 }}>
            {Object.entries(data?.metrics.providerConfiguration ?? {}).map(([provider, ready]) =>
              `${provider}: ${ready ? 'configured' : 'missing (safe skip)'}`
            ).join(' · ')}
          </p>
        </div>

        <div style={s.card}>
          <h2 style={s.cardTitle}>Delivery jobs</h2>
          <select value={state} onChange={(event) => setState(event.target.value)} style={{ marginBottom: 12 }}>
            {['all', 'queued', 'claimed', 'sent', 'delivered', 'failed', 'dead_letter', 'cancelled'].map((value) =>
              <option key={value} value={value}>{value}</option>
            )}
          </select>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data?.jobs.map((job) => (
              <div key={job.id} style={{ borderTop: '1px solid #ddd', paddingTop: 10 }}>
                <strong>{job.notification_events?.title ?? 'Notification'}</strong>
                <div style={{ fontSize: 13 }}>
                  {job.channel} · {job.state} · {job.notification_events?.event_type} · attempts {job.attempt_count}
                </div>
                {job.escalation_reason && <div style={{ fontSize: 12 }}>Reason: {job.escalation_reason}</div>}
                {job.last_error && <div style={{ fontSize: 12, color: '#a33' }}>{job.last_error}</div>}
                {['failed', 'dead_letter', 'cancelled'].includes(job.state) && (
                  <button type="button" style={s.linkBtn} onClick={() => void retry(job.id)}>Retry safely</button>
                )}
                {job.notification_attempts.length > 0 && (
                  <details><summary>Attempt history</summary>
                    {job.notification_attempts.map((attempt) => (
                      <div key={attempt.id} style={{ fontSize: 12 }}>
                        {new Date(attempt.created_at).toLocaleString()} · {attempt.state} {attempt.error ?? ''}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
