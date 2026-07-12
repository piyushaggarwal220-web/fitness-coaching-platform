'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CoachNavbar from '@/app/components/CoachNavbar'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { requireCoach } from '@/lib/coach-session'
import { mobileStyles } from '@/lib/mobile-styles'
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
    return (
      <>
        <CoachNavbar />
        <div style={mobileStyles.loading}>Loading conversation...</div>
      </>
    )
  }

  if (!conversation) {
    return (
      <>
        <CoachNavbar />
        <div style={mobileStyles.empty}>Conversation not found.</div>
      </>
    )
  }

  return (
    <>
      <CoachNavbar />
      <div style={{ ...mobileStyles.page, backgroundColor: '#f8f9fa' }}>
        <div style={mobileStyles.container}>
          <h1 style={{ ...mobileStyles.title, fontSize: '1.25rem' }}>{clientName}</h1>
          <div style={{ ...mobileStyles.card, padding: '12px 16px' }}>
            <CoachChatThread
              conversationId={conversation.id}
              coachId={conversation.coach_id}
              viewer="coach"
              initialMessages={messages}
            />
          </div>
        </div>
      </div>
    </>
  )
}
