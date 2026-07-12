'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { colors } from '@/lib/design-tokens'
import { requireCoach } from '@/lib/coach-session'
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
  }, [router])

  if (loading) return <CoachShell loading />

  return (
    <CoachShell>
      <h1 style={styles.title}>Client Conversations</h1>
      <p style={styles.subtitle}>Active coaching conversations with your clients.</p>

      {conversations.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: colors.textPrimary }}>No active conversations yet</p>
          <p style={{ margin: 0, fontSize: 14 }}>Clients will appear here when they start a chat.</p>
        </div>
      ) : (
        conversations.map((conv) => (
          <Link key={conv.id} href={`/coach/chat/${conv.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ ...styles.listItem, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                  {(conv.profiles as { name?: string })?.name ?? 'Client'}
                </div>
                <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
                  {conv.status === 'connecting' ? 'Connecting...' : 'Active'}
                </div>
              </div>
              {(conv.unread_by_coach ?? 0) > 0 && (
                <span style={{ backgroundColor: colors.accent, color: colors.textInverse, borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
                  {conv.unread_by_coach}
                </span>
              )}
            </div>
          </Link>
        ))
      )}
    </CoachShell>
  )
}
