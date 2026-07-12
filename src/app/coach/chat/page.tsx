'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CoachNavbar from '@/app/components/CoachNavbar'
import { requireCoach } from '@/lib/coach-session'
import { mobileStyles } from '@/lib/mobile-styles'
import { createClient } from '@/lib/supabase/client'
import type { CoachConversation } from '@/types/database'

const supabase = createClient()

export default function CoachChatListPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<(CoachConversation & { profiles?: { name: string } })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const coach = await requireCoach(supabase, router)
      if (!coach) { setLoading(false); return }

      const { data } = await supabase
        .from('coach_conversations')
        .select('*, profiles:client_id(name)')
        .eq('coach_id', coach.id)
        .neq('status', 'closed')
        .order('last_message_at', { ascending: false, nullsFirst: false })

      setConversations((data ?? []) as typeof conversations)
      setLoading(false)
    }
    void load()
  }, [])

  return (
    <>
      <CoachNavbar />
      <div style={{ ...mobileStyles.page, backgroundColor: '#f8f9fa' }}>
        <div style={mobileStyles.container}>
          <h1 style={mobileStyles.title}>Client Conversations</h1>
          <p style={mobileStyles.subtitle}>Active coaching conversations with your clients.</p>

          {loading ? (
            <div style={mobileStyles.loading}>Loading...</div>
          ) : conversations.length === 0 ? (
            <div style={mobileStyles.empty}>
              <p>No active conversations yet.</p>
              <p style={{ fontSize: 14 }}>Clients will appear here when they start a chat.</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <Link key={conv.id} href={`/coach/chat/${conv.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ ...mobileStyles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#1a1a2e' }}>
                      {(conv.profiles as { name?: string })?.name ?? 'Client'}
                    </div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                      {conv.status === 'connecting' ? 'Connecting...' : 'Active'}
                    </div>
                  </div>
                  {(conv.unread_by_coach ?? 0) > 0 && (
                    <span style={{ backgroundColor: '#e94560', color: 'white', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
                      {conv.unread_by_coach}
                    </span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  )
}
