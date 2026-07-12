'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { authenticateClient } from '@/lib/onboarding'
import { mobileStyles } from '@/lib/mobile-styles'
import { colors } from '@/lib/design-tokens'
import { createClient } from '@/lib/supabase/client'
import type { CoachConversation } from '@/types/database'

const supabase = createClient()

export default function ClientChatPage() {
  const router = useRouter()
  const [conversation, setConversation] = useState<CoachConversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
      const auth = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
      if (!auth?.profile) { setLoading(false); return }

      setConnecting(true)
      const res = await fetch('/api/chat/conversations', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to start conversation')
        setLoading(false)
        setConnecting(false)
        return
      }

      setConversation(data.conversation)
      setLoading(false)
      setConnecting(false)
    }
    void init()
  }, [router])

  if (loading) {
    return (
      <ClientShell title="Chat" loading hideBottomNav fullHeight>
        <span />
      </ClientShell>
    )
  }

  return (
    <ClientShell title="Chat" hideBottomNav fullHeight>
      {connecting && (
        <p style={{ margin: '8px 16px', fontSize: 14, color: colors.textMuted, textAlign: 'center', flexShrink: 0 }}>
          Connecting you with your coach...
        </p>
      )}

      {error && (
        <div style={{ ...mobileStyles.error, margin: '8px 16px', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {conversation && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <CoachChatThread
            conversationId={conversation.id}
            coachId={conversation.coach_id}
            viewer="client"
          />
        </div>
      )}
    </ClientShell>
  )
}
