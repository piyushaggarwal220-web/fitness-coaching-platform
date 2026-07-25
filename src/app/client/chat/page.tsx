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
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    const init = async () => {
      setError('')
      setConversation(null)
      setConnecting(true)
      setAuthReady(false)

      const auth = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
      if (!active) return

      // authenticateClient returns null when it already redirected (login/checkout/onboarding).
      if (!auth) {
        setConnecting(false)
        return
      }
      if (!auth.profile) {
        setAuthReady(true)
        setError('Your chat could not be opened right now. Please retry.')
        setConnecting(false)
        return
      }

      setAuthReady(true)

      // Session cookies can still be refreshing right after navigation, so retry transient failures.
      const delays = [0, 400, 1000]
      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        if (delays[attempt]) await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
        try {
          const controller = new AbortController()
          const timeout = window.setTimeout(() => controller.abort(), 12_000)
          const res = await fetch('/api/chat/conversations', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          })
          window.clearTimeout(timeout)
          const data = await res.json().catch(() => null)

          if (!res.ok) {
            const retryable =
              (res.status >= 500 || res.status === 401 || res.status === 503) &&
              attempt < delays.length - 1
            if (retryable) continue
            if (!active) return
            setError(data?.error ?? 'Failed to start conversation')
            setConnecting(false)
            return
          }

          if (!active) return
          setConversation(data.conversation)
          setConnecting(false)
          return
        } catch {
          if (attempt < delays.length - 1) continue
          if (!active) return
          setError('Failed to start conversation. Please check your connection and retry.')
          setConnecting(false)
        }
      }
    }
    void init()
    return () => {
      active = false
    }
  }, [router, reloadKey])

  if (!authReady && !error) {
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

      {error && !conversation && (
        <div style={{ margin: '8px 16px', flexShrink: 0 }}>
          <div style={mobileStyles.error}>{error}</div>
          <button
            type="button"
            onClick={() => {
              setConversation(null)
              setReloadKey((key) => key + 1)
            }}
            style={{
              marginTop: 12,
              width: '100%',
              minHeight: 48,
              borderRadius: 12,
              border: 'none',
              background: '#f97316',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Retry opening chat
          </button>
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
