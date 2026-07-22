'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { brandTitle } from '@/lib/brand'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { formatRelativeActivity } from '@/lib/coach-chat-ui'
import { colors, shadows } from '@/lib/coach-theme'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import type { CoachConversation } from '@/types/database'
import { useCoachConversationRealtime } from '@/hooks/useSupabaseRealtime'

const supabase = createClient()

export default function CoachChatListPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<(CoachConversation & { profiles?: { name: string; email: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!coachId) return
    const { data } = await supabase
      .from('coach_conversations')
      .select('*, profiles:client_id(name, email)')
      .eq('coach_id', coachId)
      .neq('status', 'closed')
      .order('last_message_at', { ascending: false, nullsFirst: false })

    setConversations((data ?? []) as typeof conversations)
    setLoading(false)
  }, [coachId])

  useEffect(() => {
    let active = true
    const authorize = async () => {
      const coach = await requireCoach(supabase, router)
      if (!active) return
      if (!coach) {
        setLoading(false)
        return
      }
      setCoachId(coach.id)
    }
    void authorize()
    return () => { active = false }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  useCoachConversationRealtime(coachId, load, 60_000, 'chat-list')

  if (loading) return <CoachShell loading />

  return (
    <CoachShell>
      <h1 style={styles.title}>{brandTitle('Client Conversations')}</h1>
      <p style={styles.subtitle}>Active coaching conversations with your clients.</p>

      {conversations.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: colors.textPrimary }}>No active conversations yet</p>
          <p style={{ margin: 0, fontSize: 14 }}>Clients will appear here when they start a chat.</p>
        </div>
      ) : (
        conversations.map((conv) => {
          const profile = conv.profiles as { name?: string; email?: string } | undefined
          const name = profile?.name || profile?.email || 'Client'
          const unread = (conv.unread_by_coach ?? 0) > 0
          return (
            <Link key={conv.id} href={`/coach/chat/${conv.id}`} style={{ textDecoration: 'none' }}>
              <div className="card-hover" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                marginBottom: 12,
                borderRadius: 16,
                border: `1px solid ${unread ? 'rgba(249,115,22,0.3)' : colors.borderSubtle}`,
                backgroundColor: unread ? colors.accentMuted : colors.bgCard,
                boxShadow: shadows.sm,
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: colors.bgElevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  color: colors.accent,
                }}>
                  {(name[0] ?? 'C').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>{name}</span>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>{formatRelativeActivity(conv.last_message_at)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conv.last_message_preview ?? 'No messages yet'}
                  </p>
                </div>
                {unread && (
                  <span style={{ backgroundColor: colors.accent, color: colors.textInverse, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                    {conv.unread_by_coach}
                  </span>
                )}
              </div>
            </Link>
          )
        })
      )}
    </CoachShell>
  )
}
