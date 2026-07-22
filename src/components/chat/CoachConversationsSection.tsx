'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CoachShell } from '@/components/ui/CoachShell'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { formatRelativeActivity } from '@/lib/coach-chat-ui'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/coach-theme'
import type { CoachConversation } from '@/types/database'
import { useCoachConversationRealtime } from '@/hooks/useSupabaseRealtime'

const supabase = createClient()

type ConversationRow = CoachConversation & {
  profiles?: { name: string; email: string }
}

function ClientAvatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? 'C').toUpperCase()
  return (
    <div style={{
      width: 48,
      height: 48,
      borderRadius: '50%',
      background: `linear-gradient(135deg, ${colors.accentMuted} 0%, ${colors.bgElevated} 100%)`,
      border: `1px solid rgba(249,115,22,0.25)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      color: colors.accent,
      flexShrink: 0,
    }}>
      {initial}
    </div>
  )
}

export function CoachConversationsSection() {
  const router = useRouter()
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!coachId) return
    const { data } = await supabase
      .from('coach_conversations')
      .select('id, client_id, coach_id, status, last_message_at, last_message_preview, unread_by_coach, unread_by_client, profiles:client_id(name, email)')
      .eq('coach_id', coachId)
      .neq('status', 'closed')
      .order('last_message_at', { ascending: false, nullsFirst: false })

    setConversations((data ?? []) as unknown as ConversationRow[])
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

  useCoachConversationRealtime(coachId, load, 60_000, 'conversation-section')

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 72, borderRadius: 16 }} />
        ))}
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <p style={{ margin: 0, color: colors.textMuted, fontSize: 14, padding: '8px 0' }}>
        No conversations yet. Clients appear here when they message you.
      </p>
    )
  }

  const unreadFirst = [...conversations].sort((a, b) => {
    const aUnread = (a.unread_by_coach ?? 0) > 0 ? 1 : 0
    const bUnread = (b.unread_by_coach ?? 0) > 0 ? 1 : 0
    if (aUnread !== bUnread) return bUnread - aUnread
    return new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {unreadFirst.slice(0, 6).map((conv) => {
        const profile = conv.profiles as { name?: string; email?: string } | undefined
        const name = profile?.name || profile?.email || 'Client'
        const unread = (conv.unread_by_coach ?? 0) > 0
        return (
          <button
            key={conv.id}
            type="button"
            onClick={() => router.push(`/coach/chat/${conv.id}`)}
            className="card-hover"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              borderRadius: 16,
              border: `1px solid ${unread ? 'rgba(249,115,22,0.3)' : colors.borderSubtle}`,
              backgroundColor: unread ? colors.accentMuted : colors.bgElevated,
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <ClientAvatar name={name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: colors.textPrimary, fontSize: 15 }}>{name}</span>
                <span style={{ fontSize: 12, color: colors.textMuted, flexShrink: 0 }}>
                  {formatRelativeActivity(conv.last_message_at)}
                </span>
              </div>
              <p style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: unread ? colors.textPrimary : colors.textMuted,
                fontWeight: unread ? 500 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {conv.last_message_preview ?? 'No messages yet'}
              </p>
            </div>
            {unread && (
              <span style={{
                backgroundColor: colors.accent,
                color: colors.textInverse,
                borderRadius: 999,
                minWidth: 22,
                height: 22,
                padding: '0 7px',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {conv.unread_by_coach}
              </span>
            )}
          </button>
        )
      })}
      {conversations.length > 6 && (
        <Link href="/coach/chat" style={{ fontSize: 14, fontWeight: 600, color: colors.accent, padding: '4px 0' }}>
          View all conversations →
        </Link>
      )}
    </div>
  )
}
