'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { authenticateClient } from '@/lib/onboarding'
import { mobileStyles } from '@/lib/mobile-styles'
import { colors, spacing } from '@/lib/design-tokens'
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

      if (data.conversation?.status === 'connecting') {
        setTimeout(async () => {
          const refresh = await fetch('/api/chat/conversations')
          const refreshData = await refresh.json()
          if (refreshData.conversation) setConversation(refreshData.conversation)
          setConnecting(false)
        }, 2000)
      } else {
        setConnecting(false)
      }
    }
    void init()
  }, [router])

  if (loading) return <ClientShell title="Chat" loading />

  return (
    <ClientShell title="Chat">
      {connecting && (
        <p style={{ margin: '0 0 12px', fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
          Connecting you with your coach...
        </p>
      )}

      {error && <div style={mobileStyles.error}>{error}</div>}

      {conversation && (
        <div style={{
          backgroundColor: colors.bgCard,
          borderRadius: 16,
          border: `1px solid ${colors.borderSubtle}`,
          overflow: 'hidden',
          height: 'calc(100vh - 180px)',
          maxHeight: 700,
        }}>
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
