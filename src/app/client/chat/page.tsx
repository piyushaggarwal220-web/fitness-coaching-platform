'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { CoachChatThread } from '@/components/chat/CoachChatThread'
import { AiCoachChatThread } from '@/components/chat/AiCoachChatThread'
import { InstantFeatureLockedPanel } from '@/components/instant/InstantFeatureLockedPanel'
import { authenticateClient } from '@/lib/onboarding'
import { canAccessInstantFeature, latestDigitalPlanSlug, purchaseRowsIndicateCoaching, purchaseRowsIndicateDigital } from '@/lib/instant-feature-access'
import { usesAiCoach } from '@/lib/coach-service'
import { mobileStyles } from '@/lib/mobile-styles'
import { createClient } from '@/lib/supabase/client'
import { isPublicDemoEmail } from '@/lib/public-demo'
import { CHAT_AFTER_ENROLLMENT_MESSAGE } from '@/lib/chat-availability'
import type { CoachConversation, OnboardingProfile } from '@/types/database'

const supabase = createClient()

export default function ClientChatPage() {
  const router = useRouter()
  const [conversation, setConversation] = useState<CoachConversation | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [readOnly, setReadOnly] = useState(false)
  const [chatLocked, setChatLocked] = useState(false)
  const [featureLocked, setFeatureLocked] = useState(false)
  const [aiMode, setAiMode] = useState(false)

  useEffect(() => {
    let active = true
    const init = async () => {
      setError('')
      setConversation(null)
      setChatLocked(false)
      setFeatureLocked(false)
      setAiMode(false)
      setConnecting(true)
      setAuthReady(false)

      const auth = await authenticateClient(supabase, router, {
        requireOnboarding: true,
        requirePayment: true,
      })
      if (!active) return

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

      const profile = auth.profile as OnboardingProfile
      const demo = isPublicDemoEmail(auth.user.email ?? profile.email)
      setReadOnly(demo)
      setAuthReady(true)

      const { data: purchases } = await supabase
        .from('purchases')
        .select('plan_slug, status')
        .eq('user_id', auth.user.id)
        .eq('status', 'captured')
        .order('created_at', { ascending: false })
        .limit(8)

      const coaching = purchaseRowsIndicateCoaching(purchases)
      const isInstantOnly =
        purchaseRowsIndicateDigital(purchases) && !coaching
      const digitalSlug = latestDigitalPlanSlug(purchases)
      const chatAllowed = canAccessInstantFeature(profile, 'ai_chat', {
        hasCoachingPurchase: coaching,
        planSlug: digitalSlug,
        isInstantOnly,
      })
      if (!chatAllowed) {
        setFeatureLocked(true)
        setConnecting(false)
        return
      }

      if (usesAiCoach(profile)) {
        setAiMode(true)
        setConnecting(false)
        return
      }

      if (demo || !profile.coach_id) {
        setChatLocked(true)
        setConnecting(false)
        return
      }

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

  if (featureLocked) {
    return (
      <ClientShell title="Chat">
        <InstantFeatureLockedPanel feature="ai_chat" />
      </ClientShell>
    )
  }

  if (aiMode) {
    return (
      <ClientShell title="AI Coach" hideBottomNav fullHeight>
        <AiCoachChatThread />
      </ClientShell>
    )
  }

  if (chatLocked) {
    return (
      <ClientShell title="Chat">
        <div
          role="status"
          style={{
            margin: '8px 0 16px',
            padding: '18px 16px',
            borderRadius: 12,
            background: 'rgba(255, 98, 0, 0.12)',
            border: '1px solid rgba(255, 98, 0, 0.35)',
            color: '#ffb07a',
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.45,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Coach chat
          </p>
          <p style={{ margin: '8px 0 0', color: '#fff' }}>{CHAT_AFTER_ENROLLMENT_MESSAGE}</p>
        </div>
      </ClientShell>
    )
  }

  return (
    <ClientShell title="Chat" hideBottomNav fullHeight>
      {connecting && !conversation && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: '#0b141a',
          }}
        >
          <p
            style={{
              margin: '12px 16px',
              fontSize: 13,
              color: '#8696a0',
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            Connecting you with your coach...
          </p>
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              className="skeleton"
              style={{ height: 44, width: '62%', borderRadius: 8, alignSelf: 'flex-start', opacity: 0.35 }}
            />
            <div
              className="skeleton"
              style={{ height: 52, width: '70%', borderRadius: 8, alignSelf: 'flex-end', opacity: 0.35 }}
            />
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
            readOnly={readOnly}
          />
        </div>
      )}
    </ClientShell>
  )
}
