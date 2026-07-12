'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
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

      const res = await fetch(`/api/chat/messages?conversationId=${conversationId}`)
      const data = await res.json()
      if (data.messages) setMessages(data.messages)
      setLoading(false)
    }
    void load()
  }, [conversationId])

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
      <h1 style={{ ...styles.title, fontSize: '1.25rem' }}>{clientName}</h1>
      <div style={{ ...styles.card, padding: '12px 16px' }}>
        <CoachChatThread
          conversationId={conversation.id}
          coachId={conversation.coach_id}
          viewer="coach"
          initialMessages={messages}
        />
      </div>
    </CoachShell>
  )
}
