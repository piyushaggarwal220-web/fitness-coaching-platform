'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Copy, Phone, Sparkles } from 'lucide-react'
import { CoachShell } from '@/components/ui/CoachShell'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { readApiJson } from '@/lib/api-response'
import { colors } from '@/lib/design-tokens'
import type { CoachConversation, ConversationMessage } from '@/types/database'

export default function CoachChatDetailPage() {
  const params = useParams()
  const router = useRouter()
  const conversationId = params.id as string
  const [conversation, setConversation] = useState<CoachConversation | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState<string | null>(null)
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadStatus, setLoadStatus] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setLoadError('')
      setLoadStatus(null)
      const delays = [0, 350, 900]
      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        if (delays[attempt]) await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
        try {
          const detailResponse = await fetch(`/api/chat/conversations/${conversationId}`, {
            credentials: 'include',
            cache: 'no-store',
          })
          const detail = await readApiJson<{
            conversation?: CoachConversation
            viewer?: 'client' | 'coach'
            client?: { name?: string; phone?: string | null }
            activePlanId?: string | null
          }>(detailResponse)

          if (!detail.ok) {
            const retryable = detailResponse.status >= 500 && attempt < delays.length - 1
            if (retryable) continue
            if (!active) return
            setLoadStatus(detailResponse.status)
            setLoadError(detail.error)
            setLoading(false)
            return
          }
          if (!detail.data.conversation || detail.data.viewer !== 'coach') {
            if (!active) return
            setLoadStatus(403)
            setLoadError('Coach access to this conversation was not confirmed.')
            setLoading(false)
            return
          }

          const messageResponse = await fetch(
            `/api/chat/messages?conversationId=${conversationId}`,
            { credentials: 'include', cache: 'no-store' }
          )
          const messageResult = await readApiJson<{ messages?: ConversationMessage[] }>(messageResponse)
          if (!messageResult.ok) {
            const retryable = messageResponse.status >= 500 && attempt < delays.length - 1
            if (retryable) continue
            if (!active) return
            setLoadStatus(messageResponse.status)
            setLoadError(messageResult.error)
            setLoading(false)
            return
          }

          if (!active) return
          setConversation(detail.data.conversation)
          setClientName(detail.data.client?.name ?? 'Client')
          const phone = detail.data.client?.phone?.trim()
          setClientPhone(phone || null)
          setActivePlanId(detail.data.activePlanId ?? null)
          setMessages(messageResult.data.messages ?? [])
          setLoading(false)
          return
        } catch {
          if (attempt < delays.length - 1) continue
          if (!active) return
          setLoadStatus(500)
          setLoadError('Chat could not be loaded right now. Please check your connection and retry.')
          setLoading(false)
        }
      }
    }
    queueMicrotask(() => void load())
    return () => { active = false }
  }, [conversationId, reloadKey])

  const copyPhone = async () => {
    if (!clientPhone) return
    try {
      await navigator.clipboard.writeText(clientPhone)
      setCopyHint('Copied')
      window.setTimeout(() => setCopyHint(''), 2000)
    } catch {
      setCopyHint('Copy failed')
      window.setTimeout(() => setCopyHint(''), 2000)
    }
  }

  const openEditPlanWithAi = () => {
    if (!conversation) return
    if (activePlanId) {
      router.push(`/coach/plan/${activePlanId}?ai=1`)
      return
    }
    router.push(`/coach/client/${conversation.client_id}/generate-plan`)
  }

  if (loading) {
    return <CoachShell loading narrow />
  }

  if (!conversation) {
    return (
      <CoachShell narrow>
        <div style={{ ...styles.emptyText, display: 'grid', gap: 12 }}>
          <strong>
            {loadStatus === 404
              ? 'Conversation not found.'
              : loadStatus === 403
                ? 'You do not have access to this conversation.'
                : 'Chat is temporarily unavailable.'}
          </strong>
          <span>{loadError}</span>
          {(loadStatus === null || loadStatus >= 500 || loadStatus === 401) && (
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              style={phoneStyles.copyBtn}
            >
              Retry
            </button>
          )}
          <Link href="/coach/chat" style={{ color: colors.accent }}>Back to conversations</Link>
        </div>
      </CoachShell>
    )
  }

  const phoneBlock = (
    <div style={phoneStyles.row}>
      <Phone size={14} color={colors.textMuted} />
      {clientPhone ? (
        <>
          <a href={`tel:${clientPhone.replace(/\s+/g, '')}`} style={phoneStyles.number}>
            {clientPhone}
          </a>
          <button type="button" onClick={() => void copyPhone()} style={phoneStyles.copyBtn} aria-label="Copy phone number">
            <Copy size={14} />
            {copyHint || 'Copy'}
          </button>
        </>
      ) : (
        <span style={phoneStyles.missing}>No phone on file</span>
      )}
    </div>
  )

  const editPlanBtn = (
    <button type="button" onClick={openEditPlanWithAi} style={phoneStyles.editAiBtn}>
      <Sparkles size={14} />
      Edit plan with AI
    </button>
  )

  return (
    <CoachShell narrow>
      <div className="coach-chat-detail">
        <div className="coach-chat-detail-header">
          <Link href="/coach/chat" className="coach-chat-detail-back" aria-label="Back to conversations">
            ←
          </Link>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ margin: 0 }}>{clientName}</h1>
            {phoneBlock}
            <div style={{ marginTop: 8 }}>{editPlanBtn}</div>
          </div>
        </div>

        <div className="coach-chat-detail-desktop-title" style={{ marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ ...styles.title, fontSize: '1.25rem', margin: 0 }}>{clientName}</h1>
              <div style={{ marginTop: 6 }}>{phoneBlock}</div>
            </div>
            {editPlanBtn}
          </div>
        </div>

        <div className="coach-chat-detail-viewport">
          <CoachChatThread
            conversationId={conversation.id}
            coachId={conversation.coach_id}
            viewer="coach"
            initialMessages={messages}
          />
        </div>
      </div>
    </CoachShell>
  )
}

const phoneStyles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  number: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.textPrimary,
    textDecoration: 'none',
    letterSpacing: '0.01em',
  },
  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    minHeight: 32,
    borderRadius: 8,
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgElevated,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  missing: {
    fontSize: 13,
    color: colors.textMuted,
  },
  editAiBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: `1px solid ${colors.accent}`,
    background: colors.accentMuted,
    color: colors.accent,
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
}
