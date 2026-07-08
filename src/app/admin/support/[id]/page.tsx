'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { SupportThread } from '@/components/support/SupportThread'
import { priorityBadgeStyle, statusBadgeStyle } from '@/components/support/styles'
import { adminStyles as s } from '@/lib/admin/styles'
import { formatFitnessGoal } from '@/lib/coach-utils'
import { getOnboardingLabel } from '@/lib/onboarding'
import {
  formatSupportCategory,
  formatSupportDate,
  formatSupportPriority,
  formatSupportStatus,
} from '@/lib/support'
import { createClient } from '@/lib/supabase/client'
import type { SupportMessage, SupportRequestWithClient } from '@/types/database'

const supabase = createClient()

export default function AdminSupportDetailPage() {
  const params = useParams()
  const requestId = typeof params.id === 'string' ? params.id : ''

  const [request, setRequest] = useState<SupportRequestWithClient | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!requestId) {
        setError('Invalid request id.')
        setLoading(false)
        return
      }

      setError('')

      const { data, error: reqError } = await supabase
        .from('support_requests')
        .select(
          '*, profiles:client_id(name, email, age, gender, fitness_goal), coaches:claimed_by(name)'
        )
        .eq('id', requestId)
        .maybeSingle()

      if (reqError || !data) {
        setError('Support request not found.')
        setLoading(false)
        return
      }

      const { data: msgs, error: msgError } = await supabase
        .from('support_messages')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true })

      if (msgError) {
        setError('Failed to load messages.')
        setLoading(false)
        return
      }

      setRequest(data as SupportRequestWithClient)
      setMessages((msgs as SupportMessage[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [requestId])

  if (loading) {
    return (
      <AdminShell>
        <div style={s.loading}>Loading support request…</div>
      </AdminShell>
    )
  }

  if (error || !request) {
    return (
      <AdminShell>
        <div style={s.page}>
          <div style={s.container}>
            <Link href="/admin/support" style={s.backLink}>
              ← Back to support queue
            </Link>
            <div style={s.errorBox}>{error || 'Request not found.'}</div>
          </div>
        </div>
      </AdminShell>
    )
  }

  const priorityStyle = priorityBadgeStyle(request.priority)
  const age = request.client_age ?? (request.profiles?.age != null ? String(request.profiles.age) : '—')
  const gender = request.client_gender
    ? getOnboardingLabel('gender', request.client_gender)
    : request.profiles?.gender
      ? getOnboardingLabel('gender', request.profiles.gender)
      : '—'
  const goal = request.client_goal
    ? formatFitnessGoal(request.client_goal)
    : formatFitnessGoal(request.profiles?.fitness_goal)

  return (
    <AdminShell>
      <div style={s.page}>
        <div style={s.container}>
          <Link href="/admin/support" style={s.backLink}>
            ← Back to support queue
          </Link>

          <h1 style={s.title}>{request.title}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            <span style={{ ...s.badge, ...statusBadgeStyle(request.status) }}>
              {formatSupportStatus(request.status)}
            </span>
            <span style={{ ...s.badge, ...s.badgeInfo }}>{formatSupportCategory(request.category)}</span>
            {priorityStyle && (
              <span style={{ ...s.badge, ...priorityStyle }}>
                {formatSupportPriority(request.priority)}
              </span>
            )}
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Request metadata</h2>
            <div style={s.infoGrid}>
              <MetaRow label="Opened" value={formatSupportDate(request.created_at)} />
              <MetaRow label="Last updated" value={formatSupportDate(request.updated_at)} />
              <MetaRow label="Claimed at" value={formatSupportDate(request.claimed_at)} />
              <MetaRow label="Closed at" value={formatSupportDate(request.closed_at)} />
              <MetaRow label="Assigned coach" value={request.coaches?.name || '—'} />
            </div>
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Client</h2>
            <div style={s.infoGrid}>
              <MetaRow label="Name" value={request.profiles?.name || '—'} />
              <MetaRow label="Email" value={request.profiles?.email || '—'} />
              <MetaRow label="Age" value={age} />
              <MetaRow label="Gender" value={gender} />
              <MetaRow label="Goal" value={goal} />
            </div>
            <Link href={`/admin/clients/${request.client_id}`} style={{ ...s.linkBtn, marginTop: 12, display: 'inline-block' }}>
              View client in admin →
            </Link>
          </div>

          {request.claimed_by && (
            <div style={s.card}>
              <h2 style={s.cardTitle}>Coach</h2>
              <MetaRow label="Assigned" value={request.coaches?.name || '—'} />
              <Link
                href={`/admin/coaches/${request.claimed_by}`}
                style={{ ...s.linkBtn, marginTop: 12, display: 'inline-block' }}
              >
                View coach in admin →
              </Link>
            </div>
          )}

          <div style={s.card}>
            <h2 style={s.cardTitle}>Initial message</h2>
            <p style={{ margin: 0, fontSize: 14, color: '#333', whiteSpace: 'pre-wrap' }}>{request.message}</p>
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>Conversation</h2>
            <SupportThread messages={messages} viewer="admin" />
          </div>

          <p style={{ fontSize: 13, color: '#888' }}>
            Admin read-only view. Claim, reply, and close actions are handled in the coach portal.
          </p>
        </div>
      </div>
    </AdminShell>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}
