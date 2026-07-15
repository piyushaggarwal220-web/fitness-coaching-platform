'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Copy, Phone } from 'lucide-react'
import { CoachShell } from '@/components/ui/CoachShell'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { readApiJson } from '@/lib/api-response'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/design-tokens'
import type { CoachConversation, ConversationMessage } from '@/types/database'

const supabase = createClient()

export default function CoachChatDetailPage() {
  const params = useParams()
  const router = useRouter()
  const conversationId = params.id as string
  const [conversation, setConversation] = useState<CoachConversation | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const coach = await requireCoach(supabase, router)
      if (!coach) { setLoading(false); return }

      const { data: conv } = await supabase
        .from('coach_conversations')
        .select('*, profiles:client_id(name, phone)')
        .eq('id', conversationId)
        .eq('coach_id', coach.id)
        .maybeSingle()

      if (!conv) { setLoading(false); return }

      setConversation(conv as CoachConversation)
      const profile = conv.profiles as { name?: string; phone?: string | null } | null
      setClientName(profile?.name ?? 'Client')
      setClientPhone(profile?.phone?.trim() ? profile.phone.trim() : null)

      const res = await fetch(`/api/chat/messages?conversationId=${conversationId}`, {
        credentials: 'include',
      })
      const parsed = await readApiJson<{ messages?: ConversationMessage[] }>(res)
      if (parsed.ok && parsed.data.messages) setMessages(parsed.data.messages)
      setLoading(false)
    }
    void load()
  }, [conversationId, router])

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

  if (loading) {
    return <CoachShell loading narrow />
  }

  if (!conversation) {
    return (
      <CoachShell narrow>
        <p style={styles.emptyText}>Conversation not found.</p>
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
          </div>
        </div>

        <div className="coach-chat-detail-desktop-title" style={{ marginBottom: 12, flexShrink: 0 }}>
          <h1 style={{ ...styles.title, fontSize: '1.25rem', margin: 0 }}>{clientName}</h1>
          <div style={{ marginTop: 6 }}>{phoneBlock}</div>
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
}
