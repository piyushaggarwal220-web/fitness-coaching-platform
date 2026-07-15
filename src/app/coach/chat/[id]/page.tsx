'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { readApiJson } from '@/lib/api-response'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import type { CoachConversation, ConversationMessage } from '@/types/database'

const supabase = createClient()

export default function CoachChatDetailPage() {
  const params = useParams()
  const router = useRouter()
  const conversationId = params.id as string
  const [conversation, setConversation] = useState<CoachConversation | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const coach = await requireCoach(supabase, router)
      if (!coach) { setLoading(false); return }

      const { data: conv } = await supabase
        .from('coach_conversations')
        .select('*, profiles:client_id(name)')
        .eq('id', conversationId)
        .eq('coach_id', coach.id)
        .maybeSingle()

      if (!conv) { setLoading(false); return }

      setConversation(conv as CoachConversation)
      setClientName((conv.profiles as { name?: string })?.name ?? 'Client')

      const res = await fetch(`/api/chat/messages?conversationId=${conversationId}`, {
        credentials: 'include',
      })
      const parsed = await readApiJson<{ messages?: ConversationMessage[] }>(res)
      if (parsed.ok && parsed.data.messages) setMessages(parsed.data.messages)
      setLoading(false)
    }
    void load()
  }, [conversationId, router])

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

  return (
    <CoachShell narrow>
      <div className="coach-chat-detail">
        <div className="coach-chat-detail-header">
          <Link href="/coach/chat" className="coach-chat-detail-back" aria-label="Back to conversations">
            ←
          </Link>
          <h1>{clientName}</h1>
        </div>

        <h1 className="coach-chat-detail-desktop-title" style={{ ...styles.title, fontSize: '1.25rem', marginBottom: 12, flexShrink: 0 }}>
          {clientName}
        </h1>

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
