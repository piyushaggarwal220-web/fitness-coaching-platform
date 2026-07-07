'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/app/components/Navbar'
import { SupportThread } from '@/components/support/SupportThread'
import { priorityBadgeStyle, statusBadgeStyle, supportStyles as s } from '@/components/support/styles'
import { authenticateClient } from '@/lib/onboarding'
import {
  addSupportReply,
  canClientReply,
  formatSupportCategory,
  formatSupportDate,
  formatSupportPriority,
  formatSupportStatus,
} from '@/lib/support'
import { createClient } from '@/lib/supabase/client'
import type { SupportMessage, SupportRequest } from '@/types/database'

const supabase = createClient()

export default function ClientSupportDetailPage() {
  const router = useRouter()
  const params = useParams()
  const requestId = typeof params.id === 'string' ? params.id : ''

  const [request, setRequest] = useState<SupportRequest | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!requestId) return
      setError('')

      const auth = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
      if (!auth) {
        setLoading(false)
        return
      }

      if (!auth.profile) {
        setLoading(false)
        return
      }

      const clientId = auth.profile.id

      const [reqRes, msgRes] = await Promise.all([
        supabase.from('support_requests').select('*').eq('id', requestId).eq('client_id', clientId).maybeSingle(),
        supabase.from('support_messages').select('*').eq('request_id', requestId).order('created_at', { ascending: true }),
      ])

      if (reqRes.error || !reqRes.data) {
        setError('Request not found.')
        setLoading(false)
        return
      }

      setRequest(reqRes.data as SupportRequest)
      setMessages((msgRes.data as SupportMessage[]) ?? [])
      setLoading(false)
    }

    void load()
  }, [requestId, router])

  const handleReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!request) return

    const auth = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
    if (!auth) return

    if (!auth.profile) return

    setSending(true)
    setError('')

    const { data, error: replyError } = await addSupportReply(supabase, {
      requestId: request.id,
      senderType: 'client',
      senderId: auth.profile.id,
      message: reply,
    })

    setSending(false)
    if (replyError || !data) {
      setError(replyError ?? 'Failed to send reply.')
      return
    }

    setMessages((prev) => [...prev, data])
    setReply('')
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={s.loading}>Loading request…</div>
      </>
    )
  }

  if (!request) {
    return (
      <>
        <Navbar />
        <div style={s.container}>
          <Link href="/client/support" style={s.backLink}>← Back to support</Link>
          <div style={s.error}>{error || 'Request not found.'}</div>
        </div>
      </>
    )
  }

  const allowReply = canClientReply(request, messages)
  const priorityStyle = priorityBadgeStyle(request.priority)

  return (
    <>
      <Navbar />
      <div style={s.page}>
        <div style={s.containerNarrow}>
          <Link href="/client/support" style={s.backLink}>← Back to support</Link>

          <h1 style={s.title}>{request.title}</h1>
          <div style={{ ...s.inboxMeta, marginBottom: 20 }}>
            <span style={{ ...s.badge, ...statusBadgeStyle(request.status) }}>{formatSupportStatus(request.status)}</span>
            <span>{formatSupportCategory(request.category)}</span>
            {priorityStyle && (
              <span style={{ ...s.badge, ...priorityStyle }}>{formatSupportPriority(request.priority)}</span>
            )}
            <span>Opened {formatSupportDate(request.created_at)}</span>
          </div>

          {error && <div style={s.error}>{error}</div>}

          <div style={s.card}>
            <SupportThread messages={messages} viewer="client" />
          </div>

          {request.status === 'closed' ? (
            <p style={{ color: '#666', fontSize: 14 }}>This request is closed. No further replies.</p>
          ) : !allowReply ? (
            <p style={{ color: '#666', fontSize: 14 }}>Your coach will reply soon. You can respond after they message you.</p>
          ) : (
            <form onSubmit={(e) => void handleReply(e)} style={s.card}>
              <label style={s.label} htmlFor="reply">Your reply</label>
              <textarea
                id="reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                style={s.textarea}
                rows={4}
                required
              />
              <div style={s.actions}>
                <button type="submit" disabled={sending} style={s.primaryBtn}>
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
