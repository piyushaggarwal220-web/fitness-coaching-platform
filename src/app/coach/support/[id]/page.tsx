'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { SupportThread } from '@/components/support/SupportThread'
import { priorityBadgeStyle, statusBadgeStyle, supportStyles as s } from '@/components/support/styles'
import { requireCoach } from '@/lib/coach-session'
import {
  addSupportReply,
  anonymizedClientSummary,
  claimSupportRequest,
  closeSupportRequest,
  formatSupportCategory,
  formatSupportDate,
  formatSupportPriority,
  formatSupportStatus,
} from '@/lib/support'
import { createClient } from '@/lib/supabase/client'
import type { Coach, SupportMessage, SupportRequestWithClient } from '@/types/database'

const supabase = createClient()

export default function CoachSupportDetailPage() {
  const router = useRouter()
  const params = useParams()
  const requestId = typeof params.id === 'string' ? params.id : ''

  const [coach, setCoach] = useState<Coach | null>(null)
  const [request, setRequest] = useState<SupportRequestWithClient | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const init = async () => {
      if (!requestId) return
      setError('')

      const coachData = await requireCoach(supabase, router)
      if (!coachData) return
      setCoach(coachData)

      const { data, error: reqError } = await supabase
        .from('support_requests')
        .select('*, profiles:client_id(name, email, age, gender, fitness_goal)')
        .eq('id', requestId)
        .maybeSingle()

      if (reqError || !data) {
        setError('Request not found or not available.')
        setLoading(false)
        return
      }

      const row = data as SupportRequestWithClient
      const canView = row.status === 'open' || row.claimed_by === coachData.id
      if (!canView) {
        setError('Request not found or not available.')
        setLoading(false)
        return
      }

      const { data: msgs } = await supabase
        .from('support_messages')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true })

      setMessages((msgs as SupportMessage[]) ?? [])
      setRequest(row)
      setLoading(false)
    }

    void init()
  }, [requestId, router])

  const refreshRequest = async () => {
    if (!coach) return null
    const { data } = await supabase
      .from('support_requests')
      .select('*, profiles:client_id(name, email, age, gender, fitness_goal)')
      .eq('id', requestId)
      .maybeSingle()
    if (!data) return null
    const row = data as SupportRequestWithClient
    setRequest(row)
    return row
  }

  const handleClaim = async () => {
    if (!coach || !request) return
    setBusy(true)
    setError('')
    setSuccess('')

    const { data, error: claimError } = await claimSupportRequest(supabase, request.id, coach.id)
    setBusy(false)

    if (claimError || !data) {
      setError(claimError ?? 'Failed to claim request.')
      return
    }

    const refreshed = await refreshRequest()
    if (refreshed) setRequest(refreshed)
    setSuccess('Request claimed. You can now reply and view the full client profile.')
  }

  const handleReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!coach || !request) return

    setBusy(true)
    setError('')
    setSuccess('')

    const { data, error: replyError } = await addSupportReply(supabase, {
      requestId: request.id,
      senderType: 'coach',
      senderId: coach.id,
      message: reply,
    })

    setBusy(false)
    if (replyError || !data) {
      setError(replyError ?? 'Failed to send reply.')
      return
    }

    setMessages((prev) => [...prev, data])
    setReply('')
    setSuccess('Reply sent.')
  }

  const handleClose = async () => {
    if (!coach || !request) return
    setBusy(true)
    setError('')
    setSuccess('')

    const { error: closeError } = await closeSupportRequest(supabase, request.id, coach.id)
    setBusy(false)

    if (closeError) {
      setError(closeError)
      return
    }

    const refreshed = await refreshRequest()
    if (refreshed) setRequest(refreshed)
    setSuccess('Request closed.')
  }

  if (loading) {
    return <CoachShell narrow loading><span /></CoachShell>
  }

  if (!request || !coach) {
    return (
      <CoachShell narrow>
        <Link href="/coach/support" style={s.backLink}>← Back to queue</Link>
        <div style={s.error}>{error || 'Request not found.'}</div>
      </CoachShell>
    )
  }

  const isOpen = request.status === 'open'
  const isClaimedByMe = request.claimed_by === coach.id && request.status === 'claimed'
  const isClosed = request.status === 'closed'
  const anonymous = isOpen
  const summary = anonymizedClientSummary(request.profiles, request.client_id, {
    client_age: request.client_age,
    client_gender: request.client_gender,
    client_goal: request.client_goal,
  })
  const priorityStyle = priorityBadgeStyle(request.priority)

  return (
    <CoachShell narrow>
          <Link href="/coach/support" style={s.backLink}>← Back to queue</Link>

          <h1 style={s.title}>{request.title}</h1>
          <div style={{ ...s.inboxMeta, marginBottom: 16 }}>
            <span style={{ ...s.badge, ...statusBadgeStyle(request.status) }}>{formatSupportStatus(request.status)}</span>
            <span>{formatSupportCategory(request.category)}</span>
            {priorityStyle && (
              <span style={{ ...s.badge, ...priorityStyle }}>{formatSupportPriority(request.priority)}</span>
            )}
            <span>Opened {formatSupportDate(request.created_at)}</span>
          </div>

          <div style={s.contextCard}>
            <strong>{anonymous ? 'Anonymous client' : 'Client profile'}</strong>
            {anonymous ? (
              <div style={{ marginTop: 8, lineHeight: 1.6 }}>
                <div>{summary.label}</div>
                <div>Age: {summary.age}</div>
                <div>Gender: {summary.gender}</div>
                <div>Goal: {summary.goal}</div>
              </div>
            ) : (
              <div style={{ marginTop: 8, lineHeight: 1.6 }}>
                <div>{request.profiles?.name || '—'}</div>
                <div>{request.profiles?.email || '—'}</div>
                <div>Age: {summary.age} · Gender: {summary.gender}</div>
                <div>Goal: {summary.goal}</div>
                {!isOpen && (
                  <Link href={`/coach/client/${request.client_id}`} style={s.backLink}>
                    Open full client profile →
                  </Link>
                )}
              </div>
            )}
          </div>

          {error && <div style={s.error}>{error}</div>}
          {success && <div style={s.success}>{success}</div>}

          <div style={s.card}>
            <SupportThread messages={messages} viewer="coach" />
          </div>

          {isOpen && (
            <div style={s.actions}>
              <button type="button" disabled={busy} onClick={() => void handleClaim()} style={s.primaryBtn}>
                {busy ? 'Claiming…' : 'Claim request'}
              </button>
            </div>
          )}

          {isClaimedByMe && (
            <>
              <form onSubmit={(e) => void handleReply(e)} style={s.card}>
                <label style={s.label} htmlFor="reply">Coach reply</label>
                <textarea
                  id="reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  style={s.textarea}
                  rows={4}
                  required
                />
                <div style={s.actions}>
                  <button type="submit" disabled={busy} style={s.primaryBtn}>
                    {busy ? 'Sending…' : 'Send reply'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void handleClose()} style={s.dangerBtn}>
                    Close request
                  </button>
                </div>
              </form>
            </>
          )}

          {isClosed && (
            <p style={{ color: '#a1a1aa', fontSize: 14 }}>This request is closed.</p>
          )}
    </CoachShell>
  )
}
