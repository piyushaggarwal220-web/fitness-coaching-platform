'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { authenticateClient } from '@/lib/onboarding'
import { mobileStyles } from '@/lib/mobile-styles'
import { createClient } from '@/lib/supabase/client'
import type { CoachConversation } from '@/types/database'

const supabase = createClient()

export default function ClientChatPage() {
  const router = useRouter()
  const [conversation, setConversation] = useState<CoachConversation | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
      const auth = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
      if (!auth?.profile) {
        setAuthReady(true)
        return
      }

      setAuthReady(true)
      setConnecting(true)

      try {
        const res = await fetch('/api/chat/conversations', {
          method: 'POST',
          credentials: 'include',
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error ?? 'Failed to start conversation')
          return
        }

        setConversation(data.conversation)
      } catch {
        setError('Failed to start conversation')
      } finally {
        setConnecting(false)
      }
    }
    void init()
  }, [router])

  if (!authReady) {
    return (
      <ClientShell title="Chat" loading hideBottomNav fullHeight>
        <span />
      </ClientShell>
    )
  }

  return (
    <ClientShell title="Chat" hideBottomNav fullHeight>
      {connecting && !conversation && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#0b141a' }}>
          <p style={{ margin: '12px 16px', fontSize: 13, color: '#8696a0', textAlign: 'center', flexShrink: 0 }}>
            Connecting you with your coach...
          </p>
          <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="skeleton" style={{ height: 44, width: '62%', borderRadius: 8, alignSelf: 'flex-start', opacity: 0.35 }} />
            <div className="skeleton" style={{ height: 52, width: '70%', borderRadius: 8, alignSelf: 'flex-end', opacity: 0.35 }} />
            <div className="skeleton" style={{ height: 40, width: '48%', borderRadius: 8, alignSelf: 'flex-start', opacity: 0.35 }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...mobileStyles.error, margin: '8px 16px', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {conversation && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
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
